import { loadConfig, type Remote } from './env';
import { mirrorCompanies, type CompanyOutcome } from './mirror-companies';

const usage = `
Job B (phase 1) — refresh the mirrored commercial fields on every Company
that carries a debtor number, and stamp lastSyncAt.

Usage:
  yarn mirror --remote dev [--dry-run | --apply]

Options:
  --remote <dev>   Target environment. Only dev is allowed for now.
  --dry-run        Show what would change without writing anything (default).
  --apply          Actually write the changed fields + lastSyncAt.
`;

const parseArgs = (): { remote: Remote; dryRun: boolean } => {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    process.exit(0);
  }

  const remoteIndex = args.indexOf('--remote');
  const remote = remoteIndex === -1 ? 'dev' : args[remoteIndex + 1];

  // Same guardrail as Job A: prod stays untouched until go-live.
  if (remote !== 'dev') {
    console.error(
      `Remote "${remote}" is not allowed yet — this tool only runs against dev for now.`,
    );
    process.exit(1);
  }

  return { remote, dryRun: !args.includes('--apply') };
};

const label: Record<CompanyOutcome['outcome'], string> = {
  updated: 'UPDATED   ',
  unchanged: 'UNCHANGED ',
  notInErp: 'NOT-IN-ERP',
  internal: 'INTERNAL  ',
  error: 'ERROR     ',
};

const main = async () => {
  const { remote, dryRun } = parseArgs();
  const config = loadConfig(remote);

  console.log(
    `Job B · ${remote} · ${dryRun ? 'DRY RUN (nothing will be written)' : 'APPLY'}`,
  );
  console.log(`CRM: ${config.twentyUrl}`);
  console.log(`ERP: ${config.erpUrl}\n`);

  const report = await mirrorCompanies(config, { dryRun });

  console.log(`Companies with a debtor number: ${report.totalCompanies}\n`);

  for (const o of report.outcomes) {
    // Unchanged rows would drown the interesting ones — count them instead.
    if (o.outcome === 'unchanged') {
      continue;
    }

    const debtor = (o.company.debtorNumber ?? '').trim();
    const parts = [`${label[o.outcome]} ${debtor.padEnd(14)} ${o.company.name}`];

    if (o.outcome === 'updated') {
      parts.push(`— ${o.changedFields!.join(', ')}`);
    }

    if (o.outcome === 'notInErp') {
      parts.push('— debtor number no longer in the ERP, needs a human');
    }

    if (o.outcome === 'internal') {
      parts.push('— ERP marks this account internal; mirror skipped');
    }

    if (o.error !== undefined) {
      parts.push(`— ${o.error}`);
    }

    console.log(parts.join(' '));

    for (const u of o.unmapped ?? []) {
      console.log(
        `           ⚠ ${u.field}: ERP value "${u.erpValue}" has no CRM option — left as is`,
      );
    }
  }

  const count = (outcome: CompanyOutcome['outcome']) =>
    report.outcomes.filter((o) => o.outcome === outcome).length;

  console.log(
    `\n${report.outcomes.length} compan(ies) checked · ` +
      `${count('updated')} updated · ${count('unchanged')} unchanged · ` +
      `${count('notInErp')} not in ERP · ${count('internal')} internal · ` +
      `${count('error')} error(s)`,
  );

  if (count('error') > 0) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);

  if (error instanceof Error && error.cause !== undefined) {
    console.error('cause:', error.cause);
  }

  process.exit(1);
});
