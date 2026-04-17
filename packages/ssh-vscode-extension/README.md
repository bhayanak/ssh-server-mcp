# SSH MCP — VS Code Extension

VS Code extension Simple SSH MCP VS Code extension for  GitHub Copilot, providing AI-powered SSH/SFTP remote operations directly in your editor.

## Requirements

- VS Code **1.99.0** or later (MCP API support)
- GitHub Copilot extension

## Features

- **Automatic MCP server registration** — The SSH MCP server starts automatically when VS Code launches
- **29 SSH/SFTP tools** available to Copilot: sessions, commands, shells, file transfers, port forwarding, diagnostics
- **Settings-driven configuration** — All server options exposed as VS Code settings
- **Config change detection** — Prompts to restart the server when settings change

## Settings

Open VS Code Settings (Cmd+, / Ctrl+,) and extension or search for "Simple SSH MCP Server":

| Setting | Default | Description |
|---------|---------|-------------|
| `sshMcp.maxConnections` | `10` | Maximum concurrent SSH sessions |
| `sshMcp.defaultTerm` | `xterm-256color` | Default TERM variable for PTY shells |
| `sshMcp.defaultCols` | `220` | Default PTY width in columns |
| `sshMcp.defaultRows` | `50` | Default PTY height in rows |
| `sshMcp.execTimeoutMs` | `30000` | Default command execution timeout (ms) |
| `sshMcp.logDir` | `~/.ssh-mcp/logs` | NDJSON log file directory |
| `sshMcp.hostKeyMode` | `accept` | Host key verification: `accept`, `strict`, or `ask` |
| `sshMcp.env` | `development` | Server environment (`production` defaults host key to `strict`) |

## Commands

- **SSH MCP: Restart Server** — Restart the MCP server process
- **SSH MCP: Open Log Directory** — Open the audit log directory in your file manager

## Usage
1. Open GitHub Copilot Chat
2. Ask Copilot to connect to a remote server:

   > "Connect to prod-web-1.example.com as deploy using my SSH key at ~/.ssh/id_ed25519"

   > "ssh to 24.736.125.847(root/somepass) and show me system cpu/disk info"

4. Copilot will use the SSH MCP tools to manage connections, run commands, transfer files, and more.
