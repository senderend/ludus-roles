# Ludus OpenClaw Role - Hardened Deployment

Deploys a security-hardened OpenClaw instance on Ludus for lab use.

## Security Features

- **Loopback/LAN binding**: Gateway binds to host IP only, not 0.0.0.0
- **mDNS disabled**: Prevents network discovery/enumeration
- **Strong auth tokens**: Auto-generated 64-character tokens
- **Docker sandboxing**: Tool execution runs in isolated containers with no network
- **UFW firewall**: Default deny incoming, explicit allow rules only
- **Non-root execution**: Runs as dedicated `openclaw` user
- **Read-only configs**: Config files mounted read-only into containers
- **Resource limits**: CPU/memory limits prevent runaway processes
- **Skills approval required**: No auto-install of third-party skills
- **Session retention limits**: Auto-cleanup of old sessions

## Installation

### 1. Add the role to Ludus

```bash
# From your Ludus host
ludus ansible role add -d ./ludus-openclaw-role
```

### 2. Configure your range

Edit `ludus-config.yml` with your settings, then:

```bash
ludus range config set -f ludus-config.yml
```

### 3. Deploy

```bash
ludus range deploy
```

## Post-Deployment Setup

### Set API Keys

SSH to the OpenClaw VM and edit the environment file:

```bash
ssh user@<openclaw-vm-ip>
sudo nano /opt/openclaw/.env
```

Add your API key(s):
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Restart the service:
```bash
cd /opt/openclaw
sudo -u openclaw docker compose restart
```

### Get Gateway Token

```bash
cat /home/openclaw/.openclaw/CREDENTIALS.txt
```

### Access via Tailscale

Since you have Tailscale subnet routing on the Ludus host:

1. Ensure the OpenClaw VM's subnet is advertised:
   ```bash
   # On Ludus host
   tailscale up --advertise-routes=10.x.20.0/24
   ```

2. Access from any Tailscale client:
   ```
   http://10.x.20.50:18789
   ```

3. Enter the gateway token when prompted

## Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `openclaw_gateway_port` | 18789 | Gateway listen port |
| `openclaw_gateway_bind` | lan | Bind mode (loopback/lan) |
| `openclaw_mdns_enabled` | false | mDNS discovery |
| `openclaw_sandbox_enabled` | true | Docker sandboxing for tools |
| `openclaw_sandbox_scope` | agent | Sandbox isolation level |
| `openclaw_sandbox_network` | none | Sandbox network access |
| `openclaw_browser_enabled` | false | Browser automation |
| `openclaw_session_max_age_days` | 14 | Session retention |
| `openclaw_cpu_limit` | 2.0 | Container CPU limit |
| `openclaw_memory_limit` | 4G | Container memory limit |

## Troubleshooting

### Check service status
```bash
cd /opt/openclaw
sudo -u openclaw docker compose ps
sudo -u openclaw docker compose logs -f
```

### Verify firewall
```bash
sudo ufw status verbose
```

### Test gateway health
```bash
curl http://localhost:18789/health
```

### Check Shodan exposure (verify you're NOT exposed)
From outside your network, your instance should NOT be visible on Shodan.
The UFW rules + Tailscale subnet routing ensure access is limited to your tailnet.

## Security Notes

1. **Never expose port 18789 to the public internet**
2. **Rotate the gateway token** if you suspect compromise
3. **Review skills** before installing - many contain security issues
4. **Monitor logs** for unexpected tool calls or sessions
5. **Keep updated** - OpenClaw is rapidly evolving with security patches
