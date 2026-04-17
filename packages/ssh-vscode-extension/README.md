# SSH MCP — VS Code Extension

VS Code extension Simple SSH MCP VS Code extension for  GitHub Copilot, providing AI-powered SSH/SFTP remote operations directly in your editor.

## Requirements

- VS Code **1.99.0** or later (MCP API support)
- GitHub Copilot extension

## Features

- **Automatic MCP server registration** — The SSH MCP server starts automatically when VS Code launches
- **49 SSH/SFTP tools** available to Copilot: sessions, commands, shells, file transfers, port forwarding, file search, server management, multi-host workflows, system snapshots, containers, and diagnostics
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
| `ssh_system_info` | Get remote server system information | "Show me the system info — CPU, memory, disk usage" |
| `ssh_get_logs` | Query audit logs with filters | "Show the last 50 command logs" |


## License

[MIT](LICENSE)