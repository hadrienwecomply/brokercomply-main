// Force verbose Graph logging before the client is built.
process.env.SHAREPOINT_DEBUG = process.env.SHAREPOINT_DEBUG ?? '1';

import { config, formatGraphError, sharePointFromConfig } from '@brokercomply/shared';

/**
 * Standalone SharePoint connectivity diagnostic — bypasses the dashboard/Next.js
 * to isolate Graph issues. Prints config presence, then walks the whole chain
 * (resolve drive → resolve root path → list root → create a throwaway test
 * folder), reporting the full error at the first step that fails.
 *
 * Usage:
 *   pnpm --filter @brokercomply/kb-compliance check:sharepoint
 *   tsx scripts/check-sharepoint.ts --no-create   # skip the test-folder write
 */
function mask(v?: string): string {
  if (!v) return 'MISSING';
  return v.length <= 8 ? 'set' : `set (${v.slice(0, 4)}…${v.slice(-2)}, len ${v.length})`;
}

async function step<T>(label: string, run: () => Promise<T>): Promise<T | undefined> {
  process.stdout.write(`\n▶ ${label}\n`);
  try {
    const res = await run();
    console.log(`  ✓ ok`);
    return res;
  } catch (err) {
    console.error(`  ✗ ${formatGraphError(err)}`);
    return undefined;
  }
}

async function main(): Promise<void> {
  const create = !process.argv.includes('--no-create');

  console.log('=== SharePoint diagnostic ===');
  console.log('Config:');
  console.log(`  AZURE_TENANT_ID      : ${config.AZURE_TENANT_ID ?? 'MISSING'}`);
  console.log(`  AZURE_CLIENT_ID      : ${config.AZURE_CLIENT_ID ?? 'MISSING'}`);
  console.log(`  AZURE_CLIENT_SECRET  : ${mask(config.AZURE_CLIENT_SECRET)}`);
  console.log(`  SHAREPOINT_SITE_ID   : ${config.SHAREPOINT_SITE_ID ?? 'MISSING'}`);
  console.log(`  SHAREPOINT_ROOT_PATH : ${config.SHAREPOINT_ROOT_PATH}`);

  let client;
  try {
    client = sharePointFromConfig();
  } catch (err) {
    console.error(`\n✗ Cannot build client: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const driveId = await step('Resolve default document library (drive)', () => client!.getDriveId());
  if (driveId) console.log(`    driveId = ${driveId}`);

  const root = await step(`Resolve root path "${config.SHAREPOINT_ROOT_PATH}"`, () =>
    client!.resolveFolderByPath(config.SHAREPOINT_ROOT_PATH),
  );
  if (root === null) {
    console.log('    ⚠ root path NOT found — check SHAREPOINT_ROOT_PATH spelling/segments.');
  } else if (root) {
    console.log(`    root folder id = ${root.id}`);
    console.log(`    root webUrl    = ${root.webUrl}`);

    await step('List root folder children (first 10)', async () => {
      const children = await client!.listFolderChildren(root.id);
      console.log(`    ${children.length} item(s):`);
      for (const c of children.slice(0, 10)) {
        console.log(`      - ${c.folder ? '[dir] ' : '      '}${c.name}`);
      }
    });
  }

  if (create) {
    const testName = '__brokercomply_diag__';
    const ref = await step(`Ensure test folder "${testName}" (idempotent, write check)`, () =>
      client!.ensureBrokerFolder(testName),
    );
    if (ref) {
      console.log(`    ${ref.created ? 'CREATED' : 'LINKED'} id=${ref.id}`);
      console.log(`    webUrl=${ref.webUrl}`);
      console.log('    (safe to delete this folder in SharePoint afterwards)');
    }
  } else {
    console.log('\n(skipped test-folder write — pass without --no-create to test writes)');
  }

  console.log('\n=== done ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
