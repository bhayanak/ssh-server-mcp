# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.1]: https://github.com/bhayanak/ssh-server-mcp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/bhayanak/ssh-server-mcp/releases/tag/v0.1.0
