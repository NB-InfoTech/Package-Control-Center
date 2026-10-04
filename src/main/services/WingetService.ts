import { CommandExecutor, CommandResult, StreamCallbacks } from './CommandExecutor.js';
import { InstalledApp, AvailableUpdate, UpgradeResult, PackageDetails, LogEntry, ProgressStep } from './types.js';
import { WingetTableParser } from './WingetParser.js';
import { updateQueueService } from './UpdateQueueService.js';

export class WingetService {
  private static readonly WINGET_COMMAND = 'winget';

  async getInstalledApps(): Promise<InstalledApp[]> {
    const result = await CommandExecutor.execute(WingetService.WINGET_COMMAND, ['list', '--accept-source-agreements']);
    return WingetTableParser.parseListOutput(result);
  }

  async getAvailableUpdates(): Promise<AvailableUpdate[]> {
    const result = await CommandExecutor.execute(WingetService.WINGET_COMMAND, ['upgrade', '--accept-source-agreements']);
    return WingetTableParser.parseUpgradeOutput(result);
  }

  async showPackage(id: string): Promise<PackageDetails> {
    const result = await CommandExecutor.execute(WingetService.WINGET_COMMAND, ['show', '--id', id, '--accept-source-agreements']);
    return this.parseShowOutput(result);
  }

  async upgradePackage(id: string, packageName?: string): Promise<UpgradeResult> {
    const operationId = updateQueueService.addOperation('upgrade', id, packageName);
    updateQueueService.updateStatus(operationId, 'running');
    updateQueueService.addLog(operationId, { level: 'info', message: `Starting upgrade for ${packageName || id}` });

    try {
      const result = await CommandExecutor.executeStreaming(
        WingetService.WINGET_COMMAND,
        ['upgrade', '--id', id, '--accept-source-agreements'],
        {
          onStdout: (data) => this.handleStreamOutput(operationId, data, 'stdout'),
          onStderr: (data) => this.handleStreamOutput(operationId, data, 'stderr'),
        },
        { timeout: 300000 }
      );

      const parsed = WingetTableParser.parseUpgradeResult(result);
      
      if (parsed.success) {
        updateQueueService.updateStatus(operationId, 'success');
        updateQueueService.addLog(operationId, { level: 'info', message: 'Upgrade completed successfully' });
        updateQueueService.updateProgress(operationId, 100, 'completed');
      } else {
        updateQueueService.setError(operationId, parsed.error || parsed.output);
        updateQueueService.addLog(operationId, { level: 'error', message: parsed.error || parsed.output });
      }

      return parsed;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      updateQueueService.setError(operationId, errorMsg);
      updateQueueService.addLog(operationId, { level: 'error', message: errorMsg });
      throw error;
    }
  }

  async upgradeAll(): Promise<UpgradeResult> {
    const operationId = updateQueueService.addOperation('upgrade-all', undefined, 'All Packages');
    updateQueueService.updateStatus(operationId, 'running');
    updateQueueService.addLog(operationId, { level: 'info', message: 'Starting upgrade for all packages' });

    try {
      const result = await CommandExecutor.executeStreaming(
        WingetService.WINGET_COMMAND,
        ['upgrade', '--all', '--accept-source-agreements'],
        {
          onStdout: (data) => this.handleStreamOutput(operationId, data, 'stdout'),
          onStderr: (data) => this.handleStreamOutput(operationId, data, 'stderr'),
        },
        { timeout: 600000 }
      );

      const parsed = WingetTableParser.parseUpgradeResult(result);
      
      if (parsed.success) {
        updateQueueService.updateStatus(operationId, 'success');
        updateQueueService.addLog(operationId, { level: 'info', message: 'All upgrades completed successfully' });
        updateQueueService.updateProgress(operationId, 100, 'completed');
      } else {
        updateQueueService.setError(operationId, parsed.error || parsed.output);
        updateQueueService.addLog(operationId, { level: 'error', message: parsed.error || parsed.output });
      }

      return parsed;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      updateQueueService.setError(operationId, errorMsg);
      updateQueueService.addLog(operationId, { level: 'error', message: errorMsg });
      throw error;
    }
  }

  private handleStreamOutput(operationId: string, data: string, stream: 'stdout' | 'stderr'): void {
    const lines = data.split('\n').filter(line => line.trim());
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const level: LogEntry['level'] = stream === 'stderr' ? 'warn' : 'info';
      updateQueueService.addLog(operationId, { level, message: trimmed });

      const step = this.detectProgressStep(trimmed);
      if (step) {
        const progress = this.stepToProgress(step);
        updateQueueService.addProgressEvent({
          operationId,
          step,
          progress,
          message: trimmed,
        });
      }
    }
  }

  private detectProgressStep(line: string): ProgressStep | null {
    const lower = line.toLowerCase();
    if (lower.includes('preparing') || lower.includes('checking') || lower.includes('acquiring')) {
      return 'preparing';
    }
    if (lower.includes('downloading') || lower.includes('download')) {
      return 'downloading';
    }
    if (lower.includes('installing') || lower.includes('install')) {
      return 'installing';
    }
    if (lower.includes('verifying') || lower.includes('verify')) {
      return 'verifying';
    }
    if (lower.includes('completed') || lower.includes('success') || lower.includes('finished')) {
      return 'completed';
    }
    return null;
  }

  private stepToProgress(step: ProgressStep): number {
    switch (step) {
      case 'preparing': return 10;
      case 'downloading': return 30;
      case 'installing': return 60;
      case 'verifying': return 85;
      case 'completed': return 100;
    }
  }

  private parseShowOutput(result: CommandResult): PackageDetails {
    const lines = result.stdout.split('\n');
    const details: Partial<PackageDetails> = {
      name: '',
      id: '',
      publisher: '',
      version: '',
      description: '',
      homepage: '',
      license: '',
      source: '',
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('Name:')) details.name = trimmed.slice(5).trim();
      else if (trimmed.startsWith('Id:')) details.id = trimmed.slice(3).trim();
      else if (trimmed.startsWith('Publisher:')) details.publisher = trimmed.slice(10).trim();
      else if (trimmed.startsWith('Version:')) details.version = trimmed.slice(8).trim();
      else if (trimmed.startsWith('Description:')) details.description = trimmed.slice(12).trim();
      else if (trimmed.startsWith('Homepage:')) details.homepage = trimmed.slice(9).trim();
      else if (trimmed.startsWith('License:')) details.license = trimmed.slice(8).trim();
      else if (trimmed.startsWith('Source:')) details.source = trimmed.slice(7).trim();
    }

    return details as PackageDetails;
  }
}