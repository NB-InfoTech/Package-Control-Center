/* PCC v2.1 multi-provider live verification (run from repo root):
 *   node scripts/verify-multi-provider.cjs
 * Exercises the compiled main-process providers against the real CLIs.
 */
const { ChocolateyProvider } = require('../dist/main/services/providers/ChocolateyProvider.js');
const { MicrosoftStoreProvider } = require('../dist/main/services/providers/MicrosoftStoreProvider.js');
const registry = require('../dist/main/services/providers/index.js');

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function truncate(s, n = 160) {
  const clean = String(s ?? '').replace(/\r/g, '');
  return clean.length > n ? clean.slice(0, n) + '…' : clean;
}

(async () => {
  let failures = 0;
  const check = (label, cond, detail = '') => {
    const mark = cond ? 'PASS' : 'FAIL';
    if (!cond) failures++;
    console.log(`[${mark}] ${label}${detail ? ` — ${truncate(detail, 120)}` : ''}`);
  };

  // --- Chocolatey provider -------------------------------------------------
  section('ChocolateyProvider');
  const choco = new ChocolateyProvider();
  const chocoAvail = await choco.checkAvailability();
  check('availability', chocoAvail.available, JSON.stringify(chocoAvail));

  if (chocoAvail.available) {
    const chocoApps = await choco.getInstalledApps();
    check(
      'installed apps',
      chocoApps.length > 0 && chocoApps.every((a) => a.source === 'chocolatey'),
      `${chocoApps.length} apps; first: ${chocoApps[0]?.id}@${chocoApps[0]?.version}`
    );

    const chocoUpdates = await choco.getAvailableUpdates();
    check(
      'outdated packages',
      chocoUpdates.every((u) => u.source === 'chocolatey' && u.availableVersion),
      `${chocoUpdates.length} updates; ${chocoUpdates.slice(0, 3).map((u) => `${u.id}:${u.currentVersion}->${u.availableVersion}`).join(', ')}`
    );

    const chocoDetails = await choco.showPackage('chocolatey');
    check(
      'showPackage(chocolatey)',
      chocoDetails.name === 'Chocolatey' && chocoDetails.version.length > 0 && chocoDetails.homepage.length > 0,
      `name=${chocoDetails.name} v=${chocoDetails.version} site=${chocoDetails.homepage}`
    );

    const chocoSearch = await choco.searchPackages('git');
    check(
      'search(git)',
      chocoSearch.length > 0 && chocoSearch.every((a) => a.source === 'chocolatey'),
      `${chocoSearch.length} results; ${chocoSearch.slice(0, 3).map((a) => a.id).join(', ')}`
    );
  }

  // --- Microsoft Store provider --------------------------------------------
  section('MicrosoftStoreProvider');
  const store = new MicrosoftStoreProvider();
  const storeAvail = await store.checkAvailability();
  check('availability (msstore source)', storeAvail.available, JSON.stringify(storeAvail));

  if (storeAvail.available) {
    const storeApps = await store.getInstalledApps();
    check(
      'installed store apps',
      storeApps.length > 0 && storeApps.every((a) => a.source === 'msstore'),
      `${storeApps.length} apps; ${storeApps.slice(0, 3).map((a) => a.id).join(', ')}`
    );

    const storeUpdates = await store.getAvailableUpdates();
    check(
      'store updates',
      storeUpdates.every((u) => u.source === 'msstore'),
      `${storeUpdates.length} updates; ${storeUpdates.slice(0, 3).map((u) => u.id).join(', ')}`
    );
  }

  // --- Registry / aggregation ----------------------------------------------
  section('Registry + aggregation');
  const infos = await registry.getProviderInfos();
  for (const info of infos) {
    check(`provider info ${info.id}`, info.name.length > 0 && typeof info.enabled === 'boolean', `${info.name} enabled=${info.enabled} available=${info.available} v=${info.version ?? '-'}`);
  }

  const active = await registry.getActiveProviders();
  check('active providers', active.length >= 2, active.map((p) => p.id).join(', '));

  const allApps = await registry.collectInstalledApps();
  const bySource = {};
  for (const a of allApps) bySource[a.source] = (bySource[a.source] ?? 0) + 1;
  check(
    'collectInstalledApps (tagged)',
    allApps.length > 0 && allApps.every((a) => a.source),
    `${allApps.length} total; ${JSON.stringify(bySource)}`
  );

  const allUpdates = await registry.collectAvailableUpdates();
  const updatesBySource = {};
  for (const u of allUpdates) updatesBySource[u.source] = (updatesBySource[u.source] ?? 0) + 1;
  check(
    'collectAvailableUpdates (tagged)',
    allUpdates.every((u) => u.source),
    `${allUpdates.length} total; ${JSON.stringify(updatesBySource)}`
  );

  const resolved = registry.getProvider('chocolatey');
  check('getProvider(chocolatey)', resolved !== undefined && resolved.id === 'chocolatey');
  const resolvedWinget = registry.getProvider('WINGET');
  check('getProvider(WINGET, case-insensitive)', resolvedWinget !== undefined && resolvedWinget.id === 'winget');
  const resolvedUnknown = registry.getProvider('nope');
  check('getProvider(unknown) -> undefined', resolvedUnknown === undefined);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});