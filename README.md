# SSH MCP Server

[![CI](https://github.com/ssh-mcp/ssh-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/ssh-mcp/ssh-mcp-server/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/ssh-mcp-server)](https://www.npmjs.com/package/ssh-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/ssh-mcp/ssh-mcp-server/blob/main/LICENSE)

An [MCP](https://modelcontextprotocol.io/) server that gives AI assistants full SSH/SFTP remote operations — session management, command execution, interactive shells, file transfers, port forwarding, and system diagnostics.

Works with Claude Desktop, VS Code + GitHub Copilot, and any MCP-compatible client.

## Packages

| Package | Description |
|---------|-------------|
| [`ssh-mcp-server`](packages/ssh-server/) | MCP server (29 tools) — standalone CLI & npm package |
| [`ssh-mcp-vscode`](packages/ssh-vscode-extension/) | VS Code extension — auto-registers the server with GitHub Copilot |

## Features

- **Session Management** — Connect/disconnect/ping with password or key-based auth
- **Command Execution** — Run commands with stdout/stderr capture, timeouts, exit codes
- **Sudo Execution** — Elevated commands with password injected via stdin (never logged)
- **Background Jobs** — Long-running commands with polling and cancellation
- **Interactive Shells** — PTY shells with read/write/resize
- **SFTP Operations** — Upload, download, read, write, delete, list, stat
- **Port Forwarding** — Local (-L) and remote (-R) SSH tunnels
- **System Diagnostics** — OS, CPU, memory, disk, network, load, processes
- **Audit Logging** — NDJSON structured logs with filtering

## Quick Start

### Standalone (npm)

```bash
npm install -g ssh-mcp-server
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ssh": {
      "command": "npx",
      "args": ["ssh-mcp-server"],
      "env": {
        "SSH_MCP_MAX_CONNECTIONS": "10",
        "SSH_MCP_HOST_KEY_MODE": "accept"
      }
    }
  }
}
```

### VS Code + GitHub Copilot

Install the [SSH MCP VS Code extension](packages/ssh-vscode-extension/) — the server starts automatically when VS Code launches. Requires VS Code 1.99+ and GitHub Copilot.

## Tools (29)

| Category | Tools |
|----------|-------|
| **Sessions** | `ssh_connect`, `ssh_disconnect`, `ssh_list_sessions`, `ssh_session_ping` |
| **Exec** | `ssh_exec`, `ssh_sudo_exec` |
| **Background** | `ssh_exec_background`, `ssh_exec_poll`, `ssh_exec_poll_list`, `ssh_exec_cancel` |
| **Shells** | `ssh_shell_open`, `ssh_shell_write`, `ssh_shell_read`, `ssh_shell_resize`, `ssh_shell_close`, `ssh_shell_list` |
| **SFTP** | `ssh_sftp_list`, `ssh_sftp_upload`, `ssh_sftp_download`, `ssh_sftp_read`, `ssh_sftp_write`, `ssh_sftp_delete`, `ssh_sftp_stat` |
| **Port Forward** | `ssh_port_forward_local`, `ssh_port_forward_remote`, `ssh_port_forward_list`, `ssh_port_forward_remove` |
| **Diagnostics** | `ssh_system_info`, `ssh_get_logs` |

## Configuration

All settings via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SSH_MCP_MAX_CONNECTIONS` | `10` | Max concurrent SSH sessions |
| `SSH_MCP_LOG_DIR` | `~/.ssh-mcp/logs` | Audit log directory |
| `SSH_MCP_DEFAULT_TERM` | `xterm-256color` | Default TERM for PTY shells |
| `SSH_MCP_DEFAULT_COLS` | `220` | Terminal width |
| `SSH_MCP_DEFAULT_ROWS` | `50` | Terminal height |
| `SSH_MCP_EXEC_TIMEOUT_MS` | `30000` | Command timeout (ms) |
| `SSH_MCP_HOST_KEY_MODE` | `accept` | Host key: `accept`, `strict`, `ask` |
| `SSH_MCP_ENV` | `development` | `production` defaults to `strict` host keys |

See [server README](packages/ssh-server/README.md) for the full configuration reference.

## Development

```bash
# Install
pnpm install

# Build all
pnpm run build

# Test
pnpm run test

# Lint + typecheck + test + format
pnpm run ci

# Package VS Code extension
pnpm --filter ssh-mcp-vscode run package
```

See [deploy-test.md](deploy-test.md) for the complete command reference.

## Project Structure

```
packages/
  ssh-server/          # MCP server (TypeScript, ESM)
  ssh-vscode-extension/  # VS Code extension (esbuild, CJS)
```

## Security

- Sudo passwords injected via stdin, **never logged**
- ANSI escape sequences stripped from output
- Output truncation prevents unbounded memory
- SSH keepalives detect dead connections
- ESLint security plugin + Gitleaks + CodeQL + Trivy in CI

## License

[MIT](LICENSE)
