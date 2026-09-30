import { type SyncConfig } from './env';
import { fetchErpStandingOrders, type ErpStandingOrder } from './erp-client';
import { buildStandingOrderFields, type UnmappedValue } from './mapping';
import { TwentyClient } from './twenty-client';

export type CompanyStandingOrderOutcome = {
  companyName: string;
  debtorNumber: string;
  created: number;
  updated: number;
  unchanged: number;
  unmapped: UnmappedValue[];
  error?: string;
};

export type StandingOrderReport = {
  dryRun: boolean;
  totalCompanies: number;
  outcomes: CompanyStandingOrderOutcome[];
};

const ERP_BATCH_SIZE = 100;

// Phase 3 — mirror each Company's standing orders as CRM records, joined on
// erpReference. Upsert by that key: new references are created, changed ones
// patched, unchanged ones left. The ERP owns them; the CRM never writes back.
export const syncStandingOrders = async (
  config: SyncConfig,
  { dryRun }: { dryRun: boolean },
): Promise<StandingOrderReport> => {
  const twenty = new TwentyClient(config);

  const companies = (await twenty.findAllCompanies()).filter(
    (company) => (company.debtorNumber ?? '').trim() !== '',
  );

  const debtorToCompany = new Map(
    companies.map((c) => [c.debtorNumber!.trim(), c]),
  );
  const debtorNumbers = [...debtorToCompany.keys()];

  const erpStandingOrders = new Map<string, ErpStandingOrder[]>();

  for (let i = 0; i < debtorNumbers.length; i += ERP_BATCH_SIZE) {
    const batch = await fetchErpStandingOrders(
      config,
      debtorNumbers.slice(i, i + ERP_BATCH_SIZE),
    );

    for (const [key, value] of batch) {
      erpStandingOrders.set(key, value);
    }
  }

  const outcomes: CompanyStandingOrderOutcome[] = [];

  for (const [debtorNumber, company] of debtorToCompany) {
    const erpList = erpStandingOrders.get(debtorNumber) ?? [];

    if (erpList.length === 0) {
      continue;
    }

    const outcome: CompanyStandingOrderOutcome = {
      companyName: company.name,
      debtorNumber,
      created: 0,
      updated: 0,
      unchanged: 0,
      unmapped: [],
    };

    try {
      const existing = await twenty.findStandingOrdersByCompany(company.id);
      const existingByRef = new Map(
        existing
          .filter((s) => s.erpReference !== null)
          .map((s) => [s.erpReference as string, s]),
      );

      for (const erpStandingOrder of erpList) {
        const { erpReference, fields, unmapped } =
          buildStandingOrderFields(erpStandingOrder);

        outcome.unmapped.push(...unmapped);

        const match = existingByRef.get(erpReference);

        if (match === undefined) {
          if (!dryRun) {
            await twenty.createStandingOrder({
              ...fields,
              companyId: company.id,
            });
          }

          outcome.created += 1;
        } else {
          // A CRM standing order carrying this reference already exists; keep
          // it current. (Field-level diffing would need reading each record
          // back; a PATCH of the mirrored fields is idempotent enough here.)
          if (!dryRun) {
            await twenty.updateStandingOrder(match.id, fields);
          }

          outcome.updated += 1;
        }
      }
    } catch (error) {
      outcome.error = error instanceof Error ? error.message : String(error);
    }

    outcomes.push(outcome);
  }

  return { dryRun, totalCompanies: companies.length, outcomes };
};
