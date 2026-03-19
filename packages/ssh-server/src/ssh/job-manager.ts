import { randomUUID } from 'crypto';
import type { SSHSession, BackgroundJob, JobInfo, ExecOptions } from './types.js';

export class JobManager {
  private jobs: Map<string, BackgroundJob> = new Map();
  private maxJobs: number;
  private maxOutputBytes: number;

  constructor(maxJobs: number, maxOutputBytes: number = 1024 * 1024) {
    this.maxJobs = maxJobs;
    this.maxOutputBytes = maxOutputBytes;
  }

  async start(session: SSHSession, command: string, options?: ExecOptions): Promise<BackgroundJob> {
    const sessionJobs = this.countForSession(session.id);
    if (sessionJobs >= this.maxJobs) {
      throw new Error(
        `Maximum background jobs reached for session (${this.maxJobs}). Cancel or wait for a job to complete.`,
      );
    }

    const fullCommand = options?.cwd ? `cd ${options.cwd} && ${command}` : command;
    const envStr = options?.env
      ? Object.entries(options.env)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ') + ' '
      : '';

    return new Promise<BackgroundJob>((resolve, reject) => {
      session.connection.exec(`${envStr}${fullCommand}`, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        const jobId = randomUUID();
        const job: BackgroundJob = {
          id: jobId,
          sessionId: session.id,
          command,
          status: 'running',
          startedAt: new Date(),
          stdout: '',
          stderr: '',
          channel: stream,
        };

        stream.on('data', (data: Buffer) => {
          if (job.stdout.length < this.maxOutputBytes) {
            job.stdout += data.toString('utf-8');
            if (job.stdout.length > this.maxOutputBytes) {
              job.stdout = job.stdout.slice(0, this.maxOutputBytes);
            }
          }
        });

        stream.stderr?.on('data', (data: Buffer) => {
          if (job.stderr.length < this.maxOutputBytes) {
            job.stderr += data.toString('utf-8');
            if (job.stderr.length > this.maxOutputBytes) {
              job.stderr = job.stderr.slice(0, this.maxOutputBytes);
            }
          }
        });

        stream.on('close', (code: number | null, signal?: string) => {
          job.exitCode = code ?? undefined;
          job.signal = signal;
          job.status = code === 0 ? 'completed' : 'failed';
          job.endedAt = new Date();
          job.channel = undefined;
        });

        this.jobs.set(jobId, job);
        resolve(job);
      });
    });
  }

  poll(jobId: string, maxOutputBytes?: number): BackgroundJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    const max = maxOutputBytes || 50000;
    // Return a copy with potentially truncated output
    return {
      ...job,
      stdout: job.stdout.slice(0, max),
      stderr: job.stderr.slice(0, max),
      channel: undefined,
    };
  }

  async cancel(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    if (job.status === 'running' && job.channel) {
      job.channel.signal('TERM');
      // Force kill after 5s if still running
      setTimeout(() => {
        if (job.status === 'running' && job.channel) {
          job.channel.signal('KILL');
        }
      }, 5000);
      job.status = 'cancelled';
      job.endedAt = new Date();
    }
  }

  list(sessionId: string): JobInfo[] {
    return Array.from(this.jobs.values())
      .filter((j) => j.sessionId === sessionId)
      .map((j) => ({
        id: j.id,
        sessionId: j.sessionId,
        command: j.command,
        status: j.status,
        startedAt: j.startedAt,
        endedAt: j.endedAt,
        exitCode: j.exitCode,
      }));
  }

  countForSession(sessionId: string): number {
    return Array.from(this.jobs.values()).filter(
      (j) => j.sessionId === sessionId && j.status === 'running',
    ).length;
  }

  cleanup(sessionId: string): void {
    for (const [id, job] of this.jobs) {
      if (job.sessionId === sessionId) {
        if (job.status === 'running' && job.channel) {
          job.channel.signal('TERM');
        }
        this.jobs.delete(id);
      }
    }
  }
}
