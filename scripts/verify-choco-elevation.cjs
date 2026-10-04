/* Chocolatey elevation fix verification (run from repo root):
 *   node scripts/verify-choco-elevation.cjs [--live <packageId>] [--skip-live]
 *
 * Checks:
 *   1. `requiresElevation` flags in the provider registry (static).
 *   2. `translateChocoError()` unit cases (static).
 *   3. Live admin detection via the compiled admin service.
 *   4. Non-elevated runtime probe: a mutating Chocolatey command through the
 *      provider layer (install of a guaranteed-nonexistent package) must
 *      complete fast, non-interactively, and fail with the friendly admin
 *      error when the process is not elevated.
 *   5. Elevated live checks (only when the process IS elevated and choco
 *      exists):
 *        - Chocolatey self-update via provider.upgradePackage('chocolatey')
 *          (only when choco itself has an available update).
 *        - One user-approved normal package via `--live <packageId>`.
 *
 * Requires a built main process: run `npm run build` first.
 */
const { ChocolateyProvider, translateChocoError } = require('../dist/main/services/providers/ChocolateyProvider.js');
const registry = require('../dist/main/services/providers/index.js');
const { isAdministrator, clearAdminCache } = require('../dist/main/services/admin.js');

const args = process.argv.slice(2);
const liveIndex = args.indexOf('--live');
const livePackage = liveIndex >= 0 ? args[liveIndex + 1] : null;
const skipLive = args.includes('--skip-live');

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function truncate(s, n = 160) {
  const clean = String(s ?? '').replace(/\r/g, '');
  return clean.length > n ? clean.slice(0, n) + '…' : clean;
}

const FRIENDLY_ADMIN_ERROR =
  'Administrator privileges are required. Please restart Package Control Center as Administrator and try again.';

(async () => {
  let failures = 0;
  let skipped = 0;
  const check = (label, cond, detail = '') => {
    const mark = cond ? 'PASS' : 'FAIL';
    if (!cond) failures++;
    console.log(`[${mark}] ${label}${detail ? ` — ${truncate(detail, 140)}` : ''}`);
  };
  const note = (label, detail = '') => {
    skipped++;
    console.log(`[SKIP] ${label}${detail ? ` — ${truncate(detail, 140)}` : ''}`);
  };

  const choco = new ChocolateyProvider();
  const chocoAvail = await choco.checkAvailability();
  const adminState = await isAdministrator();
  clearAdminCache();

  // --- 1. requiresElevation flags ------------------------------------------
  section('Provider flags (requiresElevation)');
  const infos = await registry.getProviderInfos();
  const flag = (id) => infos.find((i) => i.id === id)?.requiresElevation;
  check('winget requiresElevation === false', flag('winget') === false, `got ${flag('winget')}`);
  check('chocolatey requiresElevation === true', flag('chocolatey') === true, `got ${flag('chocolatey')}`);
  check('msstore requiresElevation === false', flag('msstore') === false, `got ${flag('msstore')}`);
  check(
    'provider instance flag matches registry',
    choco.requiresElevation === true && flag('chocolatey') === choco.requiresElevation,
    `instance=${choco.requiresElevation}`
  );

  // --- 2. translateChocoError unit cases ------------------------------------
  section('translateChocoError (unit)');
  const positiveCases = [
    'Access to the path "C:\\ProgramData\\chocolatey\\lib" is denied.',
    'System.UnauthorizedAccessException: Access to the path is denied.',
    'Admin rights required to install this package.',
    'EACCES: permission error, open',
    'Permission denied: cannot write to C:\\ProgramData\\chocolatey',
    'ERROR: You must be running from an elevated prompt',
    'Chocolatey needs elevation to install packages.',
  ];
  for (const input of positiveCases) {
    const out = translateChocoError(input);
    check(`maps admin error: ${truncate(input, 40)}`, out === FRIENDLY_ADMIN_ERROR, out ?? 'undefined');
  }
  const negativeCases = [
    'Package not found on source "community".',
    'Download of package failed: 404 Not Found.',
    '',
    undefined,
  ];
  for (const input of negativeCases) {
    const out = translateChocoError(input);
    check(`leaves non-admin error alone: ${truncate(input, 40) || '(empty)'}`, out === undefined, out ?? 'undefined');
  }

  if (!chocoAvail.available) {
    note('live Chocolatey checks', JSON.stringify(chocoAvail));
    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} (${skipped} skipped)`);
    process.exit(failures === 0 ? 0 : 1);
  }

  // --- 3. Live admin detection ----------------------------------------------
  section('Admin detection (live)');
  check(
    'isAdministrator() reports a boolean',
    typeof adminState === 'boolean',
    `this process is ${adminState ? 'ELEVATED' : 'NOT elevated'}`
  );

  // --- 4. Non-elevated runtime probe ----------------------------------------
  // A mutating choco command against a guaranteed-nonexistent package.
  // Non-destructive: nothing is ever downloaded or installed. Expected:
  //  - returns quickly (stdin 'y\r\n' pre-answers the elevation prompt, so
  //    the command never stalls on interactive input),
  //  - success === false,
  //  - NOT elevated -> friendly admin error;
  //  - elevated     -> a normal "package not found" style error.
  section('Provider-layer mutating probe (non-destructive)');
  const probeId = 'pcc-elevation-probe-does-not-exist';
  const started = Date.now();
  let probe;
  try {
    probe = await choco.installPackage(probeId, 'Elevation probe');
  } catch (error) {
    probe = { success: false, error: error instanceof Error ? error.message : String(error), output: '' };
  }
  const elapsedMs = Date.now() - started;
  check('probe finished (command returned)', probe !== null && probe !== undefined, `${elapsedMs} ms`);
  check('probe did not stall on interactive prompt', elapsedMs < 120000, `${elapsedMs} ms`);
  check('probe failed (package cannot exist)', probe.success === false, truncate(probe.error || probe.output, 80));
  if (!adminState) {
    check(
      'probe error is the friendly admin message (non-elevated)',
      (probe.error ?? '').includes('Administrator privileges are required'),
      truncate(probe.error, 100)
    );
  } else {
    check(
      'probe error is NOT the admin message when elevated (expected: not found)',
      (probe.error ?? '').length > 0 && !(probe.error ?? '').includes(FRIENDLY_ADMIN_ERROR),
      truncate(probe.error, 100)
    );
  }

  // --- 5. Elevated live checks ----------------------------------------------
  section('Elevated live checks');
  if (!adminState) {
    note('elevated live checks', 'run this script from an elevated terminal to exercise them');
  } else if (skipLive) {
    note('elevated live checks', '--skip-live supplied');
  } else {
    const updates = await choco.getAvailableUpdates();
    const chocoSelf = updates.find((u) => u.id.toLowerCase() === 'chocolatey');

    // 5a. Chocolatey self-update (only when an update is actually available;
    //     an up-to-date choco still proves the non-interactive path via 5b).
    if (chocoSelf) {
      check('chocolatey self-update available', true, `${chocoSelf.currentVersion} -> ${chocoSelf.availableVersion}`);
      const selfStart = Date.now();
      const selfResult = await choco.upgradePackage('chocolatey', 'Chocolatey');
      const selfMs = Date.now() - selfStart;
      check(
        'chocolatey self-update result',
        selfResult.success,
        `${selfMs} ms; ${truncate(selfResult.error || selfResult.output, 100)}`
      );
      if (selfResult.success) {
        note('post self-update re-probe', 'chocolatey was updated; re-run this script to confirm with the new version');
      }
    } else {
      note('chocolatey self-update', 'chocolatey is up to date — nothing to upgrade');
    }

    // 5b. One user-approved normal package.
    if (livePackage) {
      check(`upgrading user-approved package "${livePackage}"`, true, 'provider-layer upgradePackage');
      const liveStart = Date.now();
      let liveResult;
      try {
        liveResult = await choco.upgradePackage(livePackage);
      } catch (error) {
        liveResult = { success: false, error: error instanceof Error ? error.message : String(error), output: '' };
      }
      const liveMs = Date.now() - liveStart;
      check(
        `upgrade result for ${livePackage}`,
        liveResult.success,
        `${liveMs} ms; ${truncate(liveResult.error || liveResult.output, 100)}`
      );
    } else if (updates.length > 0) {
      note(
        'normal-package upgrade',
        `re-run with: node scripts/verify-choco-elevation.cjs --live <packageId> (candidates: ${updates
          .filter((u) => u.id.toLowerCase() !== 'chocolatey')
          .slice(0, 5)
          .map((u) => u.id)
          .join(', ')})`
      );
    } else {
      note('normal-package upgrade', 'no chocolatey updates available on this machine');
    }
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} (${skipped} skipped)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});