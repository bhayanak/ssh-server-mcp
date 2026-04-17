import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from './config.js';
import { EventLogger } from './logging/event-logger.js';
import { SessionManager } from './ssh/session-manager.js';
import { ShellManager } from './ssh/shell-manager.js';
import { JobManager } from './ssh/job-manager.js';
import { SFTPManager } from './ssh/sftp-manager.js';
import { PortForwardManager } from './ssh/port-forward.js';
import { registerSessionTools } from './tools/session.js';
import { registerExecTools } from './tools/exec.js';
import { registerExecBackgroundTools } from './tools/exec-background.js';
import { registerShellTools } from './tools/shell.js';
import { registerSftpTools } from './tools/sftp.js';
import { registerPortForwardTools } from './tools/port-forward.js';
import { registerSystemInfoTools } from './tools/system-info.js';
import { registerLogTools } from './tools/logs.js';
import { registerFileSearchTools } from './tools/file-search.js';
import { registerServerMgmtTools } from './tools/server-mgmt.js';
import { registerMultiHostTools } from './tools/multi-host.js';
import { registerSessionIntelTools } from './tools/session-intel.js';
import { registerContainerTools } from './tools/container.js';

export interface SSHMcpServer {
  mcpServer: McpServer;
  sessionManager: SessionManager;
  cleanup: () => Promise<void>;
}

export function createServer(config: ServerConfig): SSHMcpServer {
  const mcpServer = new McpServer(
    {
      name: 'ssh-mcp-server',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Instantiate managers
  const logger = new EventLogger(config.logDir);

  const sessionManager = new SessionManager(
    config.maxConnections,
    {
      interval: config.keepaliveIntervalMs,
      retries: config.keepaliveRetries,
    },
    config.hostKeyMode,
    logger,
  );

  const shellManager = new ShellManager({
    term: config.defaultTerm,
    cols: config.defaultCols,
    rows: config.defaultRows,
  });

  const jobManager = new JobManager(config.maxBackgroundJobs);
  const sftpManager = new SFTPManager();
  const portForwardManager = new PortForwardManager();

  // Register all tools
  registerSessionTools(
    mcpServer,
    sessionManager,
    shellManager,
    jobManager,
    portForwardManager,
    logger,
  );
  registerExecTools(mcpServer, sessionManager, logger, config);
  registerExecBackgroundTools(mcpServer, sessionManager, jobManager, logger);
  registerShellTools(mcpServer, sessionManager, shellManager, logger, config);
  registerSftpTools(mcpServer, sessionManager, sftpManager, logger, config);
  registerPortForwardTools(mcpServer, sessionManager, portForwardManager, logger);
  registerSystemInfoTools(mcpServer, sessionManager, logger);
  registerLogTools(mcpServer, logger);
  registerFileSearchTools(mcpServer, sessionManager, logger);
  registerServerMgmtTools(mcpServer, sessionManager, logger);
  registerMultiHostTools(mcpServer, sessionManager, logger, config);
  registerSessionIntelTools(mcpServer, sessionManager, logger);
  registerContainerTools(mcpServer, sessionManager, logger);

  // Cleanup function for graceful shutdown
  async function cleanup(): Promise<void> {
    await sessionManager.disconnectAll();
  }

  return { mcpServer, sessionManager, cleanup };
}
