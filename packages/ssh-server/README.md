# SSH MCP Server

[![CI](https://github.com/bhayanak/ssh-server-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/bhayanak/ssh-server-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/ssh-mcp-server)](https://www.npmjs.com/package/ssh-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/bhayanak/ssh-server-mcp/blob/main/LICENSE)

An MCP (Model Context Protocol) server [Simple SSH MCP Server](https://www.npmjs.com/package/simple-ssh-mcp-server) that gives AI assistants full SSH/SFTP remote operations capabilities — session management, command execution, interactive shells, file transfers, port forwarding, and system diagnostics.

## Features

- **Session Management** — Connect/disconnect/ping SSH sessions with password or key-based auth
- **Command Execution** — Run commands with stdout/stderr capture, timeouts, and exit codes
- **Sudo Execution** — Elevated commands with password injected via stdin (never logged)
- **Background Jobs** — Long-running commands with polling, cancellation, and status tracking
- **Interactive Shells** — PTY shells with read/write/resize for interactive workflows
- **SFTP Operations** — Upload, download, read, write, delete, list, and stat remote files
- **Port Forwarding** — Local (-L) and remote (-R) SSH tunnels
- **System Info** — OS, CPU, memory, disk, network, load, and process diagnostics
- **Audit Logging** — NDJSON structured logs with filtering by kind, session, host, and time range

## Installation

```bash
npm install -g simple-ssh-mcp-server
```

Or use directly with npx:

```bash
npx simple-ssh-mcp-server
```

## Quick Start

### With Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ssh": {
      "command": "npx",
      "args": ["simple-ssh-mcp-server"],
      "env": {
        "SSH_MCP_MAX_CONNECTIONS": "10",
        "SSH_MCP_HOST_KEY_MODE": "accept"
      }
    }
  }
}
```

### With VS Code

Install the [Simple SSH MCP VS Code extension](https://marketplace.visualstudio.com/search?term=Simple%20SSH%20MCP%20Server&target=VSCode&category=AI&sortBy=Relevance) for automatic integration with GitHub Copilot.
Install the one by `fazorboy` .

## Tools (29)

### Session Management

| Tool | Description |
|------|-------------|
| `ssh_connect` | Connect to a remote host (password or key auth) |
| `ssh_disconnect` | Close a session and clean up resources |
| `ssh_list_sessions` | List all active sessions with resource usage |
| `ssh_session_ping` | Health-check a session and measure latency |

### Command Execution

| Tool | Description |
|------|-------------|
| `ssh_exec` | Execute a command and wait for completion |
| `ssh_sudo_exec` | Execute with sudo (password via stdin, never logged) |

### Background Jobs

| Tool | Description |
|------|-------------|
| `ssh_exec_background` | Start a long-running command, returns jobId |
| `ssh_exec_poll` | Read output from a background job |
| `ssh_exec_poll_list` | List all background jobs for a session |
| `ssh_exec_cancel` | Cancel a running background job (SIGTERM) |

### Interactive Shells

| Tool | Description |
|------|-------------|
| `ssh_shell_open` | Open a PTY shell with configurable dimensions |
| `ssh_shell_write` | Write data to shell stdin |
| `ssh_shell_read` | Read buffered output from a shell |
| `ssh_shell_resize` | Resize the PTY window |
| `ssh_shell_close` | Close a shell channel |
| `ssh_shell_list` | List all open shells for a session |

### SFTP File Operations

| Tool | Description |
|------|-------------|
| `ssh_sftp_list` | List directory contents with permissions and sizes |
| `ssh_sftp_upload` | Upload a local file to the remote host |
| `ssh_sftp_download` | Download a remote file to the local machine |
| `ssh_sftp_read` | Read remote file content without downloading |
| `ssh_sftp_write` | Write text content to a remote file |
| `ssh_sftp_delete` | Delete a remote file or directory |
| `ssh_sftp_stat` | Get file/directory metadata |

### Port Forwarding

| Tool | Description |
|------|-------------|
| `ssh_port_forward_local` | Create a local port forward (SSH -L) |
| `ssh_port_forward_remote` | Create a remote port forward (SSH -R) |
| `ssh_port_forward_list` | List active port forwards |
| `ssh_port_forward_remove` | Close a port forward |

### Diagnostics

| Tool | Description |
|------|-------------|
| `ssh_system_info` | Gather OS, CPU, memory, disk, network info |
| `ssh_get_logs` | Query audit logs with filters |

## Configuration

All settings are controlled via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SSH_MCP_MAX_CONNECTIONS` | `10` | Maximum concurrent SSH sessions |
| `SSH_MCP_LOG_DIR` | `~/.ssh-mcp/logs` | NDJSON audit log directory |
| `SSH_MCP_DEFAULT_TERM` | `xterm-256color` | Default TERM for PTY shells |
| `SSH_MCP_DEFAULT_COLS` | `220` | Default terminal width (columns) |
| `SSH_MCP_DEFAULT_ROWS` | `50` | Default terminal height (rows) |
| `SSH_MCP_SHELL_READ_TIMEOUT_MS` | `5000` | Shell read timeout (ms) |
| `SSH_MCP_EXEC_TIMEOUT_MS` | `30000` | Command execution timeout (ms) |
| `SSH_MCP_MAX_BACKGROUND_JOBS` | `20` | Max background jobs per server |
| `SSH_MCP_KEEPALIVE_INTERVAL_MS` | `15000` | SSH keepalive interval (ms) |
| `SSH_MCP_KEEPALIVE_RETRIES` | `3` | Keepalive retry count before disconnect |
| `SSH_MCP_MAX_UPLOAD_SIZE_MB` | `100` | Max SFTP upload file size (MB) |
| `SSH_MCP_MAX_DOWNLOAD_SIZE_MB` | `100` | Max SFTP download file size (MB) |
| `SSH_MCP_HOST_KEY_MODE` | `accept` | Host key verification: `accept`, `strict`, or `ask` |
| `SSH_MCP_ENV` | `development` | Environment (`production` defaults host key to `strict`) |
| `SSH_MCP_FORWARD_AGENT` | `false` | Enable SSH agent forwarding |

## Examples

### Connect and run a command

```
1. ssh_connect(host: "prod-web-1.example.com", username: "deploy", privateKeyPath: "~/.ssh/id_ed25519")
2. ssh_exec(sessionId: "<id>", command: "uptime && df -h")
3. ssh_disconnect(sessionId: "<id>")
```

### Deploy with sudo

```
1. ssh_connect(host: "10.0.1.50", username: "admin", password: "***")
2. ssh_exec(sessionId: "<id>", command: "git pull origin main", cwd: "/opt/app")
3. ssh_sudo_exec(sessionId: "<id>", command: "systemctl restart app", password: "***")
4. ssh_disconnect(sessionId: "<id>")
```

### Interactive debugging

```
1. ssh_connect(host: "db-primary", username: "dba", privateKeyPath: "~/.ssh/id_rsa")
2. ssh_shell_open(sessionId: "<id>")
3. ssh_shell_write(shellId: "<id>", data: "mysql -u root -p\n")
4. ssh_shell_read(shellId: "<id>")
5. ssh_shell_write(shellId: "<id>", data: "SHOW PROCESSLIST;\n")
6. ssh_shell_read(shellId: "<id>")
7. ssh_shell_close(shellId: "<id>")
```

### File transfer

```
1. ssh_connect(...)
2. ssh_sftp_upload(sessionId: "<id>", localPath: "./config.yml", remotePath: "/etc/app/config.yml")
3. ssh_sftp_read(sessionId: "<id>", remotePath: "/var/log/app.log", maxBytes: 10000)
4. ssh_sftp_list(sessionId: "<id>", remotePath: "/opt/app/releases")
```

### Port forwarding

```
1. ssh_connect(host: "bastion.example.com", username: "ops", privateKeyPath: "~/.ssh/id_ed25519")
2. ssh_port_forward_local(sessionId: "<id>", localPort: 5432, remoteHost: "db-internal", remotePort: 5432)
   # Now connect to localhost:5432 to reach the internal database
3. ssh_port_forward_list(sessionId: "<id>")
4. ssh_port_forward_remove(forwardId: "<id>")
```

## Security

- Sudo passwords are injected via stdin and **never logged**
- ANSI escape sequences are stripped from all command output
- Output is truncated to prevent unbounded memory usage
- SSH keepalives detect dead connections automatically
- Host key verification modes: `accept` (dev), `strict` (prod), `ask`
- Structured NDJSON audit logging for all operations
- ESLint security plugin enabled for static analysis

## License

[MIT](https://github.com/ssh-mcp/ssh-mcp-server/blob/main/LICENSE)
