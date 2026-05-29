# ludus_codex_devbox

Reusable Ludus role for a remote Codex development box.

This is the standalone version of the Codex/dev tooling from the OpenIPAHound lab. It intentionally does not configure FreeIPA, BloodHound, lab hostnames, lab credentials, or project-specific files.

## What It Installs

- a normal Linux user for development
- common build/dev tools
- Node.js from NodeSource
- Codex CLI under the user's npm prefix
- VS Code Remote SSH PATH support
- persistent Codex app-server support for the Codex/OpenAI VS Code sidebar
- VS Code wrapper/adapter for Remote SSH sidebar persistence
- `agent-browser`
- Playwright Chrome/Chromium support
- standard Codex MCPs: OpenAI docs, Context7, and Playwright
- optional Ludus client

## What It Does Not Do

- no project-specific lab DNS
- no FreeIPA or BloodHound credentials
- no interactive `codex login`
- no personal `~/.codex` auth/plugin cache
- no Google Drive, Notion, or other connector account state
- no `/usr/local/bin/agent-browser` wrapper
- no FreeIPA/BHCE project adapter or lab-specific wrapper
- no public Codex app-server TCP listener

Move personal Codex auth and connector state after deploy with a separate sync step.

## Example Ludus Use

```yaml
ludus:
  - vm_name: "{{ range_id }}-codex-devbox"
    hostname: codex-devbox
    template: ubuntu-22.04-x64-server-template
    vlan: 10
    ip_last_octet: 50
    ram_gb: 10
    cpus: 6
    linux: true
    roles:
      - ludus_codex_devbox
    role_vars:
      codex_devbox_user: localuser
      codex_devbox_install_ludus_client: true
```

## Main Variables

- `codex_devbox_user` - development user, default `localuser`
- `codex_devbox_manage_user` - create/manage that user, default `true`
- `codex_devbox_hostname` - optional hostname to set, default empty
- `codex_devbox_install_ludus_client` - install Ludus CLI, default `false`
- `codex_devbox_persistent_appserver_enabled` - install and start persistent app-server service/wrapper, default `true`
- `codex_devbox_agent_browser_enabled` - install agent-browser runtime, default `true`
- `codex_devbox_playwright_enabled` - install Playwright browser support, default `true`
- `codex_devbox_mcp_servers_enabled` - configure standard MCPs, default `true`
- `codex_devbox_unattended_profile_enabled` - create optional unattended Codex profile, default `false`

## Node.js Choice

The default uses NodeSource apt packages instead of `nvm`.

That is intentional for a remote Ludus box. Codex, VS Code Remote SSH, MCPs, and the persistent app-server adapter all need Node/npm to work in non-interactive shells. NodeSource gives the machine a predictable system `node` and `npm`; Codex itself still installs into the dev user's own npm prefix, not into global system npm.

`nvm` is better for a person manually switching Node versions in an interactive shell. It is more fragile for Ansible and systemd because PATH depends on shell startup files.

## Persistent Sidebar Model

VS Code Remote SSH inherits the user's npm tool path from:

```text
~/.vscode-server/server-env-setup
```

The shell-facing Codex CLI stays user-owned at:

```text
~/.npm-global/bin/codex
```

For compatibility, the role also installs a simple pass-through:

```text
/usr/local/bin/codex
```

The VS Code sidebar uses a separate wrapper:

```text
/usr/local/bin/codex-vscode-lab
```

Normal commands pass through to the real user-owned Codex CLI. For `app-server ...` calls from the VS Code extension, the wrapper starts the user systemd service if needed, waits for:

```text
~/.codex/app-server-control/app-server-control.sock
```

Then it execs:

```text
/usr/local/lib/codex-vscode-lab/app-server-stdio-ws-adapter.mjs
```

The adapter performs the proven stdio JSONL to Unix WebSocket bridge used by the VS Code extension. The persistent service runs:

```bash
/home/localuser/.npm-global/bin/codex app-server --listen unix://
```

The behavior contract is: `codex app-server daemon version` reports `status=running`, `~/.codex/app-server-control/app-server-control.sock` exists, a `codex app-server --listen unix://` process exists, the wrapper answers VS Code JSONL requests, and no public Codex TCP listener exists.

The role writes the remote VS Code Machine settings file:

```text
~/.vscode-server/data/Machine/settings.json
```

It sets:

```json
{
  "chatgpt.cliExecutable": "/usr/local/bin/codex-vscode-lab"
}
```

No manual `settings.json` edit should be required on a fresh role install. Install the OpenAI/Codex extension in the Remote SSH window; if VS Code had already loaded the extension before the role or auth sync completed, reload the remote window.

If you need to verify manually, the extension should resolve `chatgpt.cliExecutable` to:

```text
/usr/local/bin/codex-vscode-lab
```

VS Code may gray/fade that line because it is restricted or application-scoped. The setting can still be honored by the remote extension host.

## Validation

On the devbox:

```bash
codex --version
/usr/local/bin/codex --version
/usr/local/bin/codex-vscode-lab --version
/usr/local/bin/codex-vscode-lab app-server --help
agent-browser --help
codex mcp list
systemctl --user status codex-app-server.service --no-pager
codex app-server daemon version
test -S ~/.codex/app-server-control/app-server-control.sock
pgrep -af 'codex.*app-server --listen unix://'
ss -lntup | grep -i codex || true
```

The last command should show no Codex TCP listener.

## Publishing Notes

For Ansible Galaxy, split this role into its own repository or publish it from this role directory under Allen's namespace. Keep the role name `ludus_codex_devbox` so Ludus range YAML stays clear and collision-resistant.
