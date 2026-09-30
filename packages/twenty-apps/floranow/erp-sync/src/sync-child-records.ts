import { type SyncConfig } from './env';
import { type ChildPayload, type UnmappedValue } from './mapping';
import { TwentyClient, type MirrorCompany } from './twenty-client';

export type ChildOutcome = {
  companyName: string;
  debtorNumber: string;
  created: number;
  updated: number;
  unmapped: UnmappedValue[];
  error?: string;
};

export type ChildReport = {
  dryRun: boolean;
  label: string;
  outcomes: ChildOutcome[];
};

// Config for one child record type — the REST resource, the CRM field holding
// the ERP reference, the ERP fetcher, and the mapper.
export type ChildSyncSpec<TErp> = {
  label: string;
  resource: string; // Twenty REST plural, e.g. 'orderEvents'
  refField: string; // CRM field carrying the external id, e.g. 'orderRef'
  fetch: (
    config: SyncConfig,
    debtorNumbers: string[],
  ) => Promise<Map<string, TErp[]>>;
  build: (erp: TErp) => ChildPayload;
};

const ERP_BATCH_SIZE = 100;

// Shared phase-3 upsert: for every Company with a debtor number, mirror its ERP
// child records under the Company, keyed on refField. Create new refs, patch
// existing ones, never duplicate. The ERP owns them; the CRM never writes back.
export const syncChildRecords = async <TErp>(
  config: SyncConfig,
  spec: ChildSyncSpec<TErp>,
  { dryRun }: { dryRun: boolean },
): Promise<ChildReport> => {
  const twenty = new TwentyClient(config);

  const companies: MirrorCompany[] = (await twenty.findAllCompanies()).filter(
    (company) => (company.debtorNumber ?? '').trim() !== '',
  );

  const debtorToCompany = new Map(
    companies.map((c) => [c.debtorNumber!.trim(), c]),
  );
  const debtorNumbers = [...debtorToCompany.keys()];

  const erpByDebtor = new Map<string, TErp[]>();

  for (let i = 0; i < debtorNumbers.length; i += ERP_BATCH_SIZE) {
    const batch = await spec.fetch(
      config,
      debtorNumbers.slice(i, i + ERP_BATCH_SIZE),
    );

    for (const [key, value] of batch) {
      erpByDebtor.set(key, value);
    }
  }

  const outcomes: ChildOutcome[] = [];

  for (const [debtorNumber, company] of debtorToCompany) {
    const erpList = erpByDebtor.get(debtorNumber) ?? [];

    if (erpList.length === 0) {
      continue;
    }

    const outcome: ChildOutcome = {
      companyName: company.name,
      debtorNumber,
      created: 0,
      updated: 0,
      unmapped: [],
    };

    try {
      const existing = await twenty.findChildrenByCompany(
        spec.resource,
        company.id,
      );
      const existingByRef = new Map(
        existing
          .filter((r) => r[spec.refField] != null)
          .map((r) => [String(r[spec.refField]), r]),
      );

      for (const erp of erpList) {
        const { ref, fields, unmapped } = spec.build(erp);

        outcome.unmapped.push(...unmapped);

        const match = existingByRef.get(ref);

        if (match === undefined) {
          if (!dryRun) {
            await twenty.createChild(spec.resource, {
              ...fields,
              companyId: company.id,
            });
          }

          outcome.created += 1;
        } else {
          if (!dryRun) {
            await twenty.updateChild(spec.resource, match.id, fields);
          }

          outcome.updated += 1;
        }
      }
    } catch (error) {
      outcome.error = error instanceof Error ? error.message : String(error);
    }

    outcomes.push(outcome);
  }

  return { dryRun, label: spec.label, outcomes };
};
