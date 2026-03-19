#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { mcpServer, cleanup } = createServer(config);

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  process.stderr.write(
    `SSH MCP Server started (env=${config.env}, hostKeyMode=${config.hostKeyMode})\n`,
  );

  const shutdown = async () => {
    process.stderr.write('SSH MCP Server shutting down…\n');
    await cleanup();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
