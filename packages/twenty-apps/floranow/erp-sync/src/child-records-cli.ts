import { loadConfig, type Remote } from './env';
import {
  fetchErpIncidents,
  fetchErpOrderEvents,
  fetchErpStandingOrders,
  type ErpIncident,
  type ErpOrderEvent,
  type ErpStandingOrder,
} from './erp-client';
import {
  buildIncidentFields,
  buildOrderEventFields,
  buildStandingOrderFields,
} from './mapping';
import {
  syncChildRecords,
  type ChildReport,
  type ChildSyncSpec,
} from './sync-child-records';

const SPECS: Record<
  string,
  | ChildSyncSpec<ErpOrderEvent>
  | ChildSyncSpec<ErpIncident>
  | ChildSyncSpec<ErpStandingOrder>
> = {
  'standing-orders': {
    label: 'standing orders',
    resource: 'standingOrders',
    refField: 'erpReference',
    fetch: fetchErpStandingOrders,
    // buildStandingOrderFields returns { erpReference, ... }; the engine wants
    // the ref under `ref`.
    build: (so) => {
      const { erpReference, fields, unmapped } = buildStandingOrderFields(so);

      return { ref: erpReference, fields, unmapped };
    },
  } satisfies ChildSyncSpec<ErpStandingOrder>,
  'order-events': {
    label: 'order events',
    resource: 'orderEvents',
    refField: 'orderRef',
    fetch: fetchErpOrderEvents,
    build: buildOrderEventFields,
  } satisfies ChildSyncSpec<ErpOrderEvent>,
  incidents: {
    label: 'incidents',
    resource: 'incidents',
    refField: 'erpIncidentId',
    fetch: fetchErpIncidents,
    build: buildIncidentFields,
  } satisfies ChildSyncSpec<ErpIncident>,
};

const usage = `
Phase 3 — mirror a Company's ERP child records into the CRM.

Usage:
  yarn child-records <standing-orders|order-events|incidents> --remote dev [--dry-run | --apply]
`;

const main = async () => {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(usage);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const which = args[0];
  const spec = SPECS[which];

  if (spec === undefined) {
    console.error(
      `Unknown child type "${which}". Use standing-orders, order-events or incidents.`,
    );
    process.exit(1);
  }

  const remoteIndex = args.indexOf('--remote');
  const remote = (remoteIndex === -1 ? 'dev' : args[remoteIndex + 1]) as Remote;

  if (remote !== 'dev') {
    console.error(
      `Remote "${remote}" is not allowed yet — this tool only runs against dev for now.`,
    );
    process.exit(1);
  }

  const dryRun = !args.includes('--apply');
  const config = loadConfig(remote);

  console.log(
    `${spec.label} · ${remote} · ${dryRun ? 'DRY RUN (nothing will be written)' : 'APPLY'}`,
  );
  console.log(`CRM: ${config.twentyUrl}`);
  console.log(`ERP: ${config.erpUrl}\n`);

  const report = (await syncChildRecords(
    config,
    spec as ChildSyncSpec<unknown>,
    { dryRun },
  )) as ChildReport;

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const errors: string[] = [];

  for (const o of report.outcomes) {
    created += o.created;
    updated += o.updated;
    unchanged += o.unchanged;

    console.log(
      `${o.debtorNumber.padEnd(14)} ${o.companyName} — ${o.created} created, ${o.updated} updated, ${o.unchanged} unchanged`,
    );

    const flagged = new Set(o.unmapped.map((u) => `${u.field}:${u.erpValue}`));
    for (const f of flagged) {
      console.log(`           ⚠ ${f} — no CRM option, left empty`);
    }

    if (o.error !== undefined) {
      errors.push(`${o.companyName}: ${o.error}`);
      console.log(`           ✖ ${o.error}`);
    }
  }

  console.log(
    `\n${report.outcomes.length} compan(ies) with ${spec.label} · ` +
      `${created} created · ${updated} updated · ${unchanged} unchanged · ${errors.length} error(s)`,
  );

  if (errors.length > 0) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
