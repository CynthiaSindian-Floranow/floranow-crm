import { loadConfig, type Remote } from './env';
import { syncStandingOrders } from './sync-standing-orders';

const usage = `
Phase 3 — mirror each Company's ERP standing orders as CRM records.

Usage:
  yarn standing-orders --remote dev [--dry-run | --apply]
`;

const parseArgs = (): { remote: Remote; dryRun: boolean } => {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    process.exit(0);
  }

  const remoteIndex = args.indexOf('--remote');
  const remote = remoteIndex === -1 ? 'dev' : args[remoteIndex + 1];

  if (remote !== 'dev') {
    console.error(
      `Remote "${remote}" is not allowed yet — this tool only runs against dev for now.`,
    );
    process.exit(1);
  }

  return { remote, dryRun: !args.includes('--apply') };
};

const main = async () => {
  const { remote, dryRun } = parseArgs();
  const config = loadConfig(remote);

  console.log(
    `Standing orders · ${remote} · ${dryRun ? 'DRY RUN (nothing will be written)' : 'APPLY'}`,
  );
  console.log(`CRM: ${config.twentyUrl}`);
  console.log(`ERP: ${config.erpUrl}\n`);

  const report = await syncStandingOrders(config, { dryRun });

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const o of report.outcomes) {
    created += o.created;
    updated += o.updated;

    console.log(
      `${o.debtorNumber.padEnd(14)} ${o.companyName} — ${o.created} created, ${o.updated} updated`,
    );

    for (const u of o.unmapped) {
      console.log(
        `           ⚠ ${u.field}: ERP value "${u.erpValue}" has no CRM option — left empty`,
      );
    }

    if (o.error !== undefined) {
      errors.push(`${o.companyName}: ${o.error}`);
      console.log(`           ✖ ${o.error}`);
    }
  }

  console.log(
    `\n${report.outcomes.length} compan(ies) with standing orders · ` +
      `${created} created · ${updated} updated · ${errors.length} error(s)`,
  );

  if (errors.length > 0) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
