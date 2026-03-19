import * as vscode from 'vscode';
import { join } from 'path';
import { homedir } from 'os';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SSHMcpServerDefinitionProvider(context);
  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider('ssh-mcp', provider),
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sshMcp.restartServer', async () => {
      await vscode.commands.executeCommand('github.copilot.restartMcpServer', 'ssh-mcp-server');
      vscode.window.showInformationMessage('SSH MCP Server restarted');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sshMcp.openLogDirectory', async () => {
      const config = vscode.workspace.getConfiguration('sshMcp');
      const logDir = config.get<string>('logDir') || join(homedir(), '.ssh-mcp', 'logs');
      const uri = vscode.Uri.file(logDir);
      await vscode.commands.executeCommand('revealFileInOS', uri);
    }),
  );

  // Watch for config changes and prompt restart
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('sshMcp')) {
        vscode.window
          .showInformationMessage(
            'SSH MCP Server settings changed. Restart the server to apply.',
            'Restart',
          )
          .then((choice) => {
            if (choice === 'Restart') {
              vscode.commands.executeCommand('github.copilot.restartMcpServer', 'ssh-mcp-server');
            }
          });
      }
    }),
  );
}

class SSHMcpServerDefinitionProvider implements vscode.McpServerDefinitionProvider {
  constructor(private context: vscode.ExtensionContext) {}

  provideMcpServerDefinitions(): vscode.McpServerDefinition[] {
    const config = vscode.workspace.getConfiguration('sshMcp');
    const serverPath = join(this.context.extensionPath, 'dist', 'server', 'index.cjs');

    const env: Record<string, string | number | null> = {};

    const maxConnections = config.get<number>('maxConnections');
    if (maxConnections !== undefined) env.SSH_MCP_MAX_CONNECTIONS = String(maxConnections);

    const defaultTerm = config.get<string>('defaultTerm');
    if (defaultTerm) env.SSH_MCP_DEFAULT_TERM = defaultTerm;

    const defaultCols = config.get<number>('defaultCols');
    if (defaultCols !== undefined) env.SSH_MCP_DEFAULT_COLS = String(defaultCols);

    const defaultRows = config.get<number>('defaultRows');
    if (defaultRows !== undefined) env.SSH_MCP_DEFAULT_ROWS = String(defaultRows);

    const execTimeoutMs = config.get<number>('execTimeoutMs');
    if (execTimeoutMs !== undefined) env.SSH_MCP_EXEC_TIMEOUT_MS = String(execTimeoutMs);

    const logDir = config.get<string>('logDir');
    if (logDir) env.SSH_MCP_LOG_DIR = logDir;

    const hostKeyMode = config.get<string>('hostKeyMode');
    if (hostKeyMode) env.SSH_MCP_HOST_KEY_MODE = hostKeyMode;

    const envMode = config.get<string>('env');
    if (envMode) env.SSH_MCP_ENV = envMode;

    return [
      new vscode.McpStdioServerDefinition(
        'SSH MCP Server',
        process.execPath,
        [serverPath],
        env,
      ),
    ];
  }
}

export function deactivate(): void {
  // no-op
}
