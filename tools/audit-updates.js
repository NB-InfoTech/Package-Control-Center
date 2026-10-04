/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * PCC v2.0.1 P1 — update-discovery audit funnel.
 *
 * Runs `winget upgrade --accept-source-agreements` through the exact
 * provider code path PCC uses and prints:
 *
 *   Raw Winget Output -> Parsed Packages -> Ignored Filter -> Final Display
 *
 * Usage: node tools/audit-updates.js
 */
const { WingetProvider } = require('../dist/main/services/providers/WingetProvider.js');
const { SettingsStore } = require('../dist/main/services/SettingsStore.js');

(async () => {
  const provider = new WingetProvider();
  console.error('[audit] running winget upgrade --accept-source-agreements …');
  const detailed = await provider.getAvailableUpdatesDetailed();
  const ignored = SettingsStore.getIgnoredPackages();
  const final = SettingsStore.filterIgnoredApps(detailed.updates);

  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      rawLines: detailed.rawOutput.split(/\r?\n/).length,
      parsed: detailed.updates.length,
      ignoredEntries: ignored.length,
      final: final.length,
    },
    parseAudit: detailed.parseAudit,
    rawOutput: detailed.rawOutput,
    parsedPackages: detailed.updates,
    ignoredPackages: ignored,
    finalDisplay: final.map((u) => ({ id: u.id, name: u.name })),
  };
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  console.error('[audit] failed:', error);
  process.exit(1);
});
