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
- **File Search & Analysis** — Find files, grep contents, diff, tail logs, and compute checksums
- **Server Management** — Systemd services, processes, cron jobs, network diagnostics, users
- **Multi-Host Workflows** — Broadcast commands, transfer files between hosts, jump/bastion connections, remote script execution
- **Session Intelligence** — System snapshots, snapshot diffs, and connection bookmarks
- **Container Awareness** — List, inspect logs, and exec into Docker/Podman containers
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

## Tools (49)

### Session Management

| Tool | Description | What to Ask |
|------|-------------|-------------|
| `ssh_connect` | **FIRST STEP**: Connect to a remote server via SSH | "Connect to 10.0.1.50 as admin with password Passw0rd" |
| `ssh_disconnect` | Close and disconnect an active SSH session | "Disconnect from the server" |
| `ssh_list_sessions` | Show all active SSH connections | "Show me all active SSH sessions" |
| `ssh_session_ping` | Test if an SSH session is alive | "Ping the SSH session to check if it's alive" |

### Command Execution

| Tool | Description | What to Ask |
|------|-------------|-------------|
| `ssh_exec` | Run a command on the connected server | "Run uptime and df -h on the server" |
| `ssh_sudo_exec` | Run a command with sudo privileges | "Restart nginx with sudo" |

### Background Jobs

| Tool | Description | What to Ask |
|------|-------------|-------------|
| `ssh_exec_background` | Start a long-running command for async polling | "Start a backup of /opt/app in the background" |
| `ssh_exec_poll` | Fetch output from a background job | "Check the progress of that backup job" |
| `ssh_exec_poll_list` | List all active background jobs | "Show all running background jobs" |
| `ssh_exec_cancel` | Stop a background job (requires jobId) | "Cancel the backup job" |

### Interactive Shells

| Tool | Description | What to Ask |
|------|-------------|-------------|
| `ssh_shell_open` | Open an interactive PTY terminal (mysql, python, top) | "Open an interactive shell session" |
| `ssh_shell_write` | Type text into an open PTY terminal | "Type 'mysql -u root -p' into the shell" |
| `ssh_shell_read` | Read output from an open PTY terminal | "Show me the shell output" |
| `ssh_shell_resize` | Change dimensions of a PTY terminal | "Resize the shell to 200 columns" |
| `ssh_shell_close` | Close an interactive PTY terminal | "Close the interactive shell" |
| `ssh_shell_list` | List open PTY terminals for a session | "How many shells are open?" |

### SFTP File Operations

| Tool | Description | What to Ask |
|------|-------------|-------------|
| `ssh_sftp_list` | List directory contents (like ls -la) | "List files in /opt/app on the remote server" |
| `ssh_sftp_upload` | Upload a local file to the remote server | "Upload ./deploy.sh to /tmp/ on the server" |
| `ssh_sftp_download` | Download a file from the remote server | "Download /var/log/app.log from the server" |
| `ssh_sftp_read` | Read remote file content in-place | "Show me the contents of /etc/nginx/nginx.conf" |
| `ssh_sftp_write` | Create or overwrite a remote file with text | "Write 'key: value' to /tmp/config.yml on the server" |
| `ssh_sftp_delete` | Delete a file or directory on the remote server | "Delete /tmp/old-backup.tar.gz on the server" |
| `ssh_sftp_stat` | Get file metadata: size, permissions, timestamps | "Get the size and permissions of /var/log/syslog" |

### Port Forwarding

| Tool | Description | What to Ask |
|------|-------------|-------------|
| `ssh_port_forward_local` | Create SSH tunnel: local port → remote host:port | "Forward local port 5432 to db-internal:5432 through the SSH session" |
| `ssh_port_forward_remote` | Create reverse tunnel: remote port → local host:port | "Expose my local port 3000 as port 8080 on the remote server" |
| `ssh_port_forward_list` | List all active SSH port forwards | "Show all active port forwards" |
| `ssh_port_forward_remove` | Close an SSH port forward by its ID | "Remove the port forward to the database" |

### File Search & Analysis

| Tool | Description | What to Ask |
|------|-------------|-------------|
| `ssh_find` | Locate files by name pattern (like Linux find) | "Find all .war files on the server" |
| `ssh_grep` | Search text patterns inside remote files (grep) | "Search for ERROR or FATAL in /var/log" |
| `ssh_diff` | Show differences between two remote files | "Diff nginx.conf with nginx.conf.bak" |
| `ssh_tail` | Show last N lines of a remote file | "Show last 100 lines of syslog with errors" |
| `ssh_checksum` | Compute hash (md5/sha256/sha512) of a remote file | "Get the SHA256 checksum of release.tar.gz" |

### Server Management

| Tool | Description | What to Ask |
|------|-------------|-------------|
| `ssh_service` | Manage systemd services: start/stop/restart/status/list | "What's the status of the nginx service?" |
| `ssh_process` | List, filter, or kill processes. Find by port | "What process is listening on port 8080?" |
| `ssh_cron` | View, add, or remove scheduled cron jobs | "Show all cron jobs for root" |
| `ssh_network` | Network diagnostics: ports, ping, DNS, routes | "Show all listening ports on the server" |
| `ssh_user` | User and group info: whoami, list, details | "Who am I logged in as and what groups am I in?" |

### Multi-Host & Workflow

| Tool | Description | What to Ask |
|------|-------------|-------------|
| `ssh_broadcast` | Run same command on multiple servers at once | "Run 'uptime' on all connected servers" |
| `ssh_transfer` | Copy a file between two remote servers | "Copy /etc/app.conf from server A to server B" |
| `ssh_jump_connect` | SSH through a bastion/jump host | "Connect to 10.0.1.50 through the bastion server" |
| `ssh_script` | Upload and execute a script in one step | "Write and run this bash script on the server: ..." |

### Session Intelligence

| Tool | Description | What to Ask |
|------|-------------|-------------|
| `ssh_snapshot` | Capture full system state snapshot | "Take a snapshot of the system state before I deploy" |
| `ssh_snapshot_diff` | Compare two snapshots to see what changed | "Compare the pre-deploy and post-deploy snapshots" |
| `ssh_bookmark` | Save/list/delete connection bookmarks (NOT for connecting) | "Save this connection as 'prod-web' so I can reconnect later" |

### Container Awareness

| Tool | Description | What to Ask |
|------|-------------|-------------|
| `ssh_container_list` | List Docker/Podman containers with resource usage | "Show all Docker containers on the server" |
| `ssh_container_logs` | View Docker/Podman container logs | "Show the last 50 lines of the nginx container logs" |
| `ssh_container_exec` | Run a command inside a Docker/Podman container | "Run 'cat /etc/hosts' inside the app container" |

### Diagnostics

| Tool | Description | What to Ask |
|------|-------------|-------------|
| `ssh_system_info` | Gather OS, CPU, memory, disk, network info | "Show me the system info — CPU, memory, disk usage" |
| `ssh_get_logs` | Query audit logs with filters | "Show the last 50 command logs" |

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
