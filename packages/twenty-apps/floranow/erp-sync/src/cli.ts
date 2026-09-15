import { loadConfig, type Remote } from './env';
import { syncQualifiedLeads, type LeadOutcome } from './sync-qualified-leads';

const usage = `
Job A — provision CRM Companies for qualified leads that carry a debtor number.

Usage:
  yarn sync --remote dev [--dry-run | --apply]

Options:
  --remote <dev>   Target environment. Only dev is allowed for now; prod is
                   refused until the dev run has been verified.
  --dry-run        Show what would happen without writing anything (default).
  --apply          Actually write: create Companies, link contacts, flip leads.
`;

const parseArgs = (): { remote: Remote; dryRun: boolean } => {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    process.exit(0);
  }

  const remoteIndex = args.indexOf('--remote');
  const remote = remoteIndex === -1 ? 'dev' : args[remoteIndex + 1];

  // Deliberate guardrail: prod stays untouched until dev is verified.
  if (remote !== 'dev') {
    console.error(
      `Remote "${remote}" is not allowed yet — this tool only runs against dev for now.`,
    );
    process.exit(1);
  }

  const apply = args.includes('--apply');
  const dryRun = args.includes('--dry-run') || !apply;

  return { remote, dryRun };
};

const label: Record<LeadOutcome['outcome'], string> = {
  created: 'CREATED   ',
  attached: 'ATTACHED  ',
  waitingForErp: 'WAITING   ',
  duplicateDebtorNumber: 'DUPLICATE ',
  error: 'ERROR     ',
};

const main = async () => {
  const { remote, dryRun } = parseArgs();
  const config = loadConfig(remote);

  console.log(
    `Job A · ${remote} · ${dryRun ? 'DRY RUN (nothing will be written)' : 'APPLY'}`,
  );
  console.log(`CRM: ${config.twentyUrl}`);
  console.log(`ERP: ${config.erpUrl}\n`);

  const report = await syncQualifiedLeads(config, { dryRun });

  console.log(
    `Qualified leads: ${report.totalQualified} · with debtor number: ${report.withDebtorNumber}\n`,
  );

  for (const o of report.outcomes) {
    const debtor = o.lead.debtorNumber?.trim() ?? '';
    const parts = [
      `${label[o.outcome]} ${debtor.padEnd(14)} ${o.lead.name}`,
    ];

    if (o.outcome === 'created' || o.outcome === 'attached') {
      parts.push(`→ Company "${o.companyName}" (${o.companyId})`);
    }

    if (o.outcome === 'waitingForErp') {
      parts.push('— debtor number not in the ERP yet, lead left untouched');
    }

    if (o.outcome === 'duplicateDebtorNumber') {
      parts.push('— same debtor number on an earlier lead this run');
    }

    if (o.error !== undefined) {
      parts.push(`— ${o.error}`);
    }

    console.log(parts.join(' '));

    if (o.missingOwner === true) {
      console.log('           ⚠ lead has no owner — Company has no AM');
    }

    for (const u of o.unmapped ?? []) {
      console.log(
        `           ⚠ ${u.field}: ERP value "${u.erpValue}" has no CRM option — left empty`,
      );
    }
  }

  const errors = report.outcomes.filter((o) => o.outcome === 'error');

  console.log(
    `\n${report.outcomes.length} lead(s) processed · ` +
      `${report.outcomes.filter((o) => o.outcome === 'created').length} created · ` +
      `${report.outcomes.filter((o) => o.outcome === 'attached').length} attached · ` +
      `${report.outcomes.filter((o) => o.outcome === 'waitingForErp').length} waiting · ` +
      `${errors.length} error(s)`,
  );

  if (errors.length > 0) {
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
