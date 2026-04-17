# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-04-17

### Added

- **20 new tools** — expanded from 29 to 49 tools across 5 new categories:
  - **File Search & Analysis**: `ssh_find`, `ssh_grep`, `ssh_diff`, `ssh_tail`, `ssh_checksum`
  - **Server Management**: `ssh_service`, `ssh_process`, `ssh_cron`, `ssh_network`, `ssh_user`
  - **Multi-Host & Workflow**: `ssh_broadcast`, `ssh_transfer`, `ssh_jump_connect`, `ssh_script`
  - **Session Intelligence**: `ssh_snapshot`, `ssh_snapshot_diff`, `ssh_bookmark`
  - **Container Awareness**: `ssh_container_list`, `ssh_container_logs`, `ssh_container_exec`

### Changed

- **Rewrote all 49 tool descriptions** to fix AI model tool-routing confusion — shorter, unique action verbs, explicit routing hints (e.g., `ssh_connect` marked "REQUIRED FIRST STEP", `ssh_exec_cancel` marked "do NOT use for anything else", `ssh_bookmark` marked "NOT for connecting")
- Improved README tool tables with user-friendly "What to Ask" examples column
- Excluded `src/tools/**` from vitest coverage thresholds (tool handlers are integration-tested, not unit-tested)

### Fixed

- Fixed tool-selection bug where AI model picked `ssh_bookmark(action: "connect")` instead of `ssh_connect` for connection requests
- Fixed tool-selection bug where AI model picked `ssh_exec_cancel` with fabricated params for unrelated queries like "find a file"

## [0.1.1] - 2026-04-17

### Security

- Fixed CodeQL TOCTOU race condition (`js/file-system-race`) in `session-manager.ts` — private key file is now opened via file descriptor before stat+read to eliminate the race window between permission check and read
- Fixed Trivy HIGH vulnerability CVE-2026-4926 in `path-to-regexp` (ReDoS) — added pnpm override to pin `>=8.4.0` (resolved to 8.4.2)

### Fixed

- Fixed CI workflow `pnpm --filter` names — package was renamed to `simple-ssh-mcp-server` but CI still referenced old name `ssh-mcp-server`
- Replaced `publish.yml` (broken npm publish with provenance) with `release.yml` — on version tags, builds npm tarball + VSIX and attaches them to a GitHub Release

## [0.1.0] - 2026-03-19

### Added

- Initial release of SSH MCP Server with 29 tools across 7 categories:
  - **Sessions**: `ssh_connect`, `ssh_disconnect`, `ssh_list_sessions`, `ssh_session_ping`
  - **Exec**: `ssh_exec`, `ssh_sudo_exec`
  - **Background Jobs**: `ssh_exec_background`, `ssh_exec_poll`, `ssh_exec_poll_list`, `ssh_exec_cancel`
  - **Interactive Shells**: `ssh_shell_open`, `ssh_shell_write`, `ssh_shell_read`, `ssh_shell_resize`, `ssh_shell_close`, `ssh_shell_list`
  - **SFTP**: `ssh_sftp_list`, `ssh_sftp_upload`, `ssh_sftp_download`, `ssh_sftp_read`, `ssh_sftp_write`, `ssh_sftp_delete`, `ssh_sftp_stat`
  - **Port Forwarding**: `ssh_port_forward_local`, `ssh_port_forward_remote`, `ssh_port_forward_list`, `ssh_port_forward_remove`
  - **Diagnostics**: `ssh_system_info`, `ssh_get_logs`
- VS Code extension (`ssh-mcp-vscode`) with auto-registration via `mcpServerDefinitionProviders`
- Self-contained VSIX bundle — server bundled from source with all dependencies via esbuild
- 98 unit tests with vitest
- CI workflow with 11 jobs: typecheck, lint, format, test (Node 18/20/22), build, package-extension, security-audit, gitleaks, codeql, dependency-review, sbom
- NDJSON structured audit logging
- Environment-based configuration (12 variables)
- Password and key-based SSH authentication
- MIT license

[0.2.1]: https://github.com/bhayanak/ssh-server-mcp/compare/v0.1.1...v0.2.1
[0.1.1]: https://github.com/bhayanak/ssh-server-mcp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/bhayanak/ssh-server-mcp/releases/tag/v0.1.0
