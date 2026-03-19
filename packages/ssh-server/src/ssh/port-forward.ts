import { randomUUID } from 'crypto';
import { createServer, createConnection } from 'net';
import type { SSHSession, PortForward, PortForwardInfo } from './types.js';

export class PortForwardManager {
  private forwards: Map<string, PortForward> = new Map();

  async createLocal(
    session: SSHSession,
    localPort: number,
    remoteHost: string,
    remotePort: number,
    bindAddress: string = '127.0.0.1',
  ): Promise<PortForward> {
    const forwardId = randomUUID();

    const server = createServer((socket) => {
      session.connection.forwardOut(
        bindAddress,
        localPort,
        remoteHost,
        remotePort,
        (err, stream) => {
          if (err) {
            socket.end();
            return;
          }
          stream.pipe(socket);
          socket.pipe(stream);

          socket.on('error', () => stream.end());
          stream.on('error', () => socket.end());
        },
      );
    });

    return new Promise<PortForward>((resolve, reject) => {
      server.on('error', reject);
      server.listen(localPort, bindAddress, () => {
        const forward: PortForward = {
          id: forwardId,
          sessionId: session.id,
          type: 'local',
          localPort,
          localAddress: bindAddress,
          remoteHost,
          remotePort,
          createdAt: new Date(),
          server,
        };
        this.forwards.set(forwardId, forward);
        resolve(forward);
      });
    });
  }

  async createRemote(
    session: SSHSession,
    remotePort: number,
    localHost: string = '127.0.0.1',
    localPort: number,
    bindAddress: string = '127.0.0.1',
  ): Promise<PortForward> {
    const forwardId = randomUUID();

    return new Promise<PortForward>((resolve, reject) => {
      session.connection.forwardIn(bindAddress, remotePort, (err) => {
        if (err) {
          reject(err);
          return;
        }

        const forward: PortForward = {
          id: forwardId,
          sessionId: session.id,
          type: 'remote',
          localPort,
          localAddress: localHost,
          remoteHost: bindAddress,
          remotePort,
          createdAt: new Date(),
        };

        this.forwards.set(forwardId, forward);

        // Handle incoming connections on the remote side
        session.connection.on('tcp connection', (info, accept, _reject) => {
          if (info.destPort === remotePort) {
            const stream = accept();
            const socket = createConnection({ host: localHost, port: localPort });
            stream.pipe(socket);
            socket.pipe(stream);

            socket.on('error', () => stream.end());
            stream.on('error', () => socket.end());
          }
        });

        resolve(forward);
      });
    });
  }

  async remove(forwardId: string): Promise<void> {
    const forward = this.forwards.get(forwardId);
    if (!forward) {
      throw new Error(`Port forward not found: ${forwardId}`);
    }

    if (forward.server) {
      forward.server.close();
    }

    this.forwards.delete(forwardId);
  }

  list(sessionId: string): PortForwardInfo[] {
    return Array.from(this.forwards.values())
      .filter((f) => f.sessionId === sessionId)
      .map((f) => ({
        id: f.id,
        sessionId: f.sessionId,
        type: f.type,
        localPort: f.localPort,
        localAddress: f.localAddress,
        remoteHost: f.remoteHost,
        remotePort: f.remotePort,
        createdAt: f.createdAt,
      }));
  }

  closeAllForSession(sessionId: string): void {
    for (const [id, forward] of this.forwards) {
      if (forward.sessionId === sessionId) {
        if (forward.server) forward.server.close();
        this.forwards.delete(id);
      }
    }
  }
}
