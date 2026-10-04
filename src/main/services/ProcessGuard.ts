/**
 * ProcessGuard — application-in-use detection and remediation
 * (PCC v2.0.1, Priority 3).
 *
 * When a winget upgrade fails with 0x80070020 ("file in use"), this
 * service finds the processes / services that are most likely holding
 * the package's files and can terminate them (after explicit user
 * confirmation) so the update can be retried.
 *
 * The framework is data-driven: add an entry to APP_PROFILES to cover
 * another app (Docker, VSCode, Java, Chrome, Teams, …). A generic
 * name-token fallback is used when no profile matches.
 */

import { CommandExecutor } from './CommandExecutor.js';
import type { ProcessTarget, ProcessTerminateResult } from './types.js';

interface AppProfile {
  /** Matches against the package id and display name (case-insensitive). */
  match: RegExp;
  /** Process image names that lock the package files. */
  processes: string[];
  /** Windows service names that lock the package files. */
  services?: string[];
}

const APP_PROFILES: AppProfile[] = [
  {
    match: /ollama/i,
    processes: ['Ollama.exe', 'OllamaApp.exe'],
    services: ['OllamaService', 'Ollama'],
  },
  {
    match: /docker/i,
    processes: ['Docker Desktop.exe', 'com.docker.backend.exe', 'DockerCli.exe'],
    services: ['com.docker.service'],
  },
  {
    match: /visualstudio\.code|codium/i,
    processes: ['Code.exe', 'CodeSetup.exe'],
  },
  {
    match: /chrome/i,
    processes: ['chrome.exe'],
  },
  {
    match: /teams/i,
    processes: ['ms-teams.exe', 'ms-teams-app.exe'],
  },
  {
    match: /java|jdk|jre/i,
    processes: ['java.exe', 'javaw.exe'],
  },
  {
    match: /windowsterminal/i,
    processes: ['wt.exe', 'WindowsTerminal.exe'],
  },
  {
    match: /notepad/i,
    processes: ['notepad++.exe'],
  },
];

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

/** Token used for the generic fallback (e.g. "Ollama" for "Ollama.Ollama"). */
function genericToken(packageId: string, packageName?: string): string | null {
  const raw = (packageName || packageId || '').split(/[.\s]+/).filter(Boolean);
  // Prefer a display-name token; fall back to the last id segment.
  const candidate = (packageName && packageName.trim()) || raw[raw.length - 1] || '';
  const token = candidate.trim().toLowerCase();
  if (!token || token.length < 3) return null;
  return token;
}

export class ProcessGuard {
  /** Running process image names (e.g. "OllamaApp.exe"). */
  static async listRunningProcesses(): Promise<string[]> {
    try {
      const result = await CommandExecutor.execute('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 30000 });
      const names = new Set<string>();
      for (const line of result.stdout.split(/\r?\n/)) {
        const m = line.match(/^"([^"]+)"/);
        if (m) names.add(m[1]);
      }
      return [...names];
    } catch {
      return [];
    }
  }

  /** Running Windows service names. */
  static async listRunningServices(): Promise<string[]> {
    try {
      const result = await CommandExecutor.execute('sc', ['query', 'state=', 'all'], { timeout: 60000 });
      const running = new Set<string>();
      let current: string | null = null;
      for (const line of result.stdout.split(/\r?\n/)) {
        const nameMatch = line.match(/SERVICE_NAME:\s*(\S+)/i);
        if (nameMatch) {
          current = nameMatch[1];
          continue;
        }
        const stateMatch = line.match(/STATE\s*:\s*(\S+)\s+(\S+)/i);
        if (stateMatch && current && /RUNNING/i.test(stateMatch[2])) {
          running.add(current);
        }
      }
      return [...running];
    } catch {
      return [];
    }
  }

  /**
   * Find running processes / services that are likely blocking the given
   * package. Returns only targets that are actually running.
   */
  static async findBlockers(packageId: string, packageName?: string): Promise<ProcessTarget[]> {
    const [processes, services] = await Promise.all([
      this.listRunningProcesses(),
      this.listRunningServices(),
    ]);
    const runningProcesses = new Set(processes);
    const runningServices = new Set(services);

    const profile = APP_PROFILES.find(
      (p) => p.match.test(packageId) || (packageName ? p.match.test(packageName) : false)
    );

    const targets: ProcessTarget[] = [];

    if (profile) {
      for (const proc of profile.processes) {
        if (runningProcesses.has(proc)) targets.push({ name: proc, kind: 'process', running: true });
      }
      for (const svc of profile.services ?? []) {
        if (runningServices.has(svc)) targets.push({ name: svc, kind: 'service', running: true });
      }
    }

    // Generic fallback: process image whose name (without .exe) contains the app token.
    const token = genericToken(packageId, packageName);
    if (token) {
      for (const proc of processes) {
        if (targets.some((t) => t.name === proc)) continue;
        const base = proc.replace(/\.exe$/i, '').toLowerCase();
        // Require the token to be a meaningful portion of the image name.
        if (base.length - token.length <= Math.floor(base.length / 2) && base.includes(token)) {
          targets.push({ name: proc, kind: 'process', running: true });
        }
      }
    }

    return targets;
  }

  /**
   * Terminate the given processes (taskkill /F) and stop the given
   * services (sc stop). Best-effort: individual failures are reported,
   * not thrown.
   */
  static async terminate(request: {
    processes: string[];
    services?: string[];
  }): Promise<ProcessTerminateResult> {
    const results: ProcessTerminateResult['results'] = [];

    for (const proc of uniq(request.processes ?? [])) {
      try {
        await CommandExecutor.execute('taskkill', ['/F', '/IM', proc], { timeout: 30000 });
        results.push({ name: proc, kind: 'process', success: true });
      } catch {
        results.push({ name: proc, kind: 'process', success: false });
      }
    }

    for (const svc of uniq(request.services ?? [])) {
      try {
        const r = await CommandExecutor.execute('sc', ['stop', svc], { timeout: 30000 });
        const stopped = r.exitCode === 0 || /STOP_PENDING|stopped/i.test(r.stdout + r.stderr);
        results.push({ name: svc, kind: 'service', success: stopped });
      } catch {
        results.push({ name: svc, kind: 'service', success: false });
      }
    }

    return { results };
  }

  /**
   * Split a flat list of target names (processes and/or services) into the
   * two lists ProcessGuard.terminate() expects, using live tasklist/sc
   * data. Names the system cannot verify are routed by their shape
   * (.exe -> taskkill, otherwise -> sc stop).
   */
  static async splitTargets(names: string[]): Promise<{ processes: string[]; services: string[] }> {
    const [runningProcesses, runningServices] = await Promise.all([
      this.listRunningProcesses(),
      this.listRunningServices(),
    ]);
    const procSet = new Set(runningProcesses);
    const svcSet = new Set(runningServices);
    const processes: string[] = [];
    const services: string[] = [];
    for (const name of uniq(names)) {
      if (procSet.has(name)) {
        processes.push(name);
      } else if (svcSet.has(name)) {
        services.push(name);
      } else if (/\.exe$/i.test(name)) {
        processes.push(name);
      } else {
        services.push(name);
      }
    }
    return { processes, services };
  }

  /** Kill all winget.exe processes (used by the force-stop exit path). */
  static async killWingetProcesses(): Promise<boolean> {
    try {
      await CommandExecutor.execute('taskkill', ['/F', '/IM', 'winget.exe'], { timeout: 30000 });
      return true;
    } catch {
      // Not an error if no winget process was running.
      return true;
    }
  }
}

