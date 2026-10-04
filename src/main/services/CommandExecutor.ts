import { spawn } from 'child_process';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CommandOptions {
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /**
   * Data written to the child's stdin immediately after spawn (then closed).
   * Used to answer interactive prompts non-interactively — e.g. Chocolatey's
   * "not running from an elevated shell" question, which `-y` does NOT
   * suppress (verified against choco 2.7.3).
   */
  stdinData?: string;
}

export interface StreamCallbacks {
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export class CommandExecutor {
  static async execute(command: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
    const { timeout = 120000, cwd, env, stdinData } = options;

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        windowsHide: true,
      });
      if (stdinData) {
        child.stdin?.write(stdinData);
        child.stdin?.end();
      }

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms: ${command} ${args.join(' ')}`));
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
      });

      child.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        if (!timedOut) {
          reject(new Error(`Failed to spawn command: ${error.message}`));
        }
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timeoutId);
        if (!timedOut) {
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code ?? -1,
          });
        }
      });
    });
  }

  static async executeStreaming(
    command: string,
    args: string[],
    callbacks: StreamCallbacks,
    options: CommandOptions = {}
  ): Promise<CommandResult> {
    const { timeout = 300000, cwd, env, stdinData } = options;

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        windowsHide: true,
      });
      if (stdinData) {
        child.stdin?.write(stdinData);
        child.stdin?.end();
      }

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms: ${command} ${args.join(' ')}`));
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        callbacks.onStdout?.(text);
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        callbacks.onStderr?.(text);
      });

      child.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        if (!timedOut) {
          reject(new Error(`Failed to spawn command: ${error.message}`));
        }
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timeoutId);
        if (!timedOut) {
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code ?? -1,
          });
        }
      });
    });
  }

  static async executeWithOutput(command: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
    return this.execute(command, args, options);
  }
}