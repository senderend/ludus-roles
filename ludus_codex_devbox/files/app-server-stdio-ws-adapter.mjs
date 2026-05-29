import crypto from "node:crypto";
import net from "node:net";
import process from "node:process";

const sockPath =
  process.argv[2] ||
  `${process.env.HOME}/.codex/app-server-control/app-server-control.sock`;

const socket = net.createConnection(sockPath);
let handshake = Buffer.alloc(0);
let established = false;
let frameBuffer = Buffer.alloc(0);

function encodeFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const header = [];
  header.push(0x81);
  if (payload.length < 126) {
    header.push(0x80 | payload.length);
  } else if (payload.length < 65536) {
    header.push(0x80 | 126, (payload.length >> 8) & 0xff, payload.length & 0xff);
  } else {
    const len = BigInt(payload.length);
    header.push(0x80 | 127);
    for (let shift = 56n; shift >= 0n; shift -= 8n) {
      header.push(Number((len >> shift) & 0xffn));
    }
  }
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i] ^ mask[i % 4];
  }
  return Buffer.concat([Buffer.from(header), mask, masked]);
}

function decodeAvailableFrames() {
  while (frameBuffer.length >= 2) {
    const first = frameBuffer[0];
    const second = frameBuffer[1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (frameBuffer.length < offset + 2) return;
      length = frameBuffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (frameBuffer.length < offset + 8) return;
      const bigLength = frameBuffer.readBigUInt64BE(offset);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Frame too large");
      }
      length = Number(bigLength);
      offset += 8;
    }
    let mask;
    if (masked) {
      if (frameBuffer.length < offset + 4) return;
      mask = frameBuffer.subarray(offset, offset + 4);
      offset += 4;
    }
    if (frameBuffer.length < offset + length) return;
    let payload = frameBuffer.subarray(offset, offset + length);
    frameBuffer = frameBuffer.subarray(offset + length);
    if (masked) {
      const unmasked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) {
        unmasked[i] = payload[i] ^ mask[i % 4];
      }
      payload = unmasked;
    }
    if (opcode === 0x1) {
      process.stdout.write(payload.toString("utf8"));
      if (!payload.toString("utf8").endsWith("\n")) process.stdout.write("\n");
    } else if (opcode === 0x8) {
      socket.end();
      return;
    }
  }
}

socket.on("connect", () => {
  const key = crypto.randomBytes(16).toString("base64");
  socket.write(
    [
      "GET / HTTP/1.1",
      "Host: localhost",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Key: ${key}`,
      "Sec-WebSocket-Version: 13",
      "",
      "",
    ].join("\r\n"),
  );
});

socket.on("data", (chunk) => {
  if (!established) {
    handshake = Buffer.concat([handshake, chunk]);
    const headerEnd = handshake.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    const headers = handshake.subarray(0, headerEnd).toString("utf8");
    if (!headers.startsWith("HTTP/1.1 101")) {
      throw new Error(`WebSocket upgrade failed: ${headers}`);
    }
    established = true;
    const rest = handshake.subarray(headerEnd + 4);
    if (rest.length > 0) frameBuffer = Buffer.concat([frameBuffer, rest]);
    process.stdin.resume();
    decodeAvailableFrames();
    return;
  }
  frameBuffer = Buffer.concat([frameBuffer, chunk]);
  decodeAvailableFrames();
});

let stdinBuffer = "";
process.stdin.pause();
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdinBuffer += chunk;
  let index;
  while ((index = stdinBuffer.indexOf("\n")) !== -1) {
    const line = stdinBuffer.slice(0, index);
    stdinBuffer = stdinBuffer.slice(index + 1);
    if (line.length > 0) socket.write(encodeFrame(line));
  }
});
process.stdin.on("end", () => {
  if (stdinBuffer.length > 0) socket.write(encodeFrame(stdinBuffer));
  setTimeout(() => socket.end(), 250);
});

socket.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
