import { type SyncConfig } from './env';
import {
  fetchErpCustomers,
  fetchErpFinancials,
  type ErpCustomerFinancials,
  type ErpCustomerSnapshot,
} from './erp-client';
import {
  buildFinancialFields,
  buildMirrorFields,
  type UnmappedValue,
} from './mapping';
import { TwentyClient, type MirrorCompany } from './twenty-client';

export type CompanyOutcome = {
  company: MirrorCompany;
  outcome:
    | 'updated' // one or more mirror fields changed
    | 'unchanged' // ERP and CRM already agree
    | 'notInErp' // debtor number vanished from the ERP — needs a human
    | 'internal' // ERP now marks the account internal — reported, not synced
    | 'error';
  changedFields?: string[];
  unmapped?: UnmappedValue[];
  error?: string;
};

export type MirrorReport = {
  dryRun: boolean;
  totalCompanies: number;
  outcomes: CompanyOutcome[];
};

const ERP_BATCH_SIZE = 100;

// Composite fields compare by their meaningful parts, scalars by value.
const valuesDiffer = (current: unknown, next: unknown): boolean => {
  if (typeof next === 'object' && next !== null) {
    const currentObject = (current ?? {}) as Record<string, unknown>;

    return Object.entries(next).some(
      ([key, value]) => (currentObject[key] ?? null) !== (value ?? null),
    );
  }

  return (current ?? null) !== (next ?? null);
};

// Job B phase 1 — refresh the mirrored commercial group on every Company that
// carries a debtor number, and stamp lastSyncAt. Never touches identity keys,
// name, or CRM-owned fields; only PATCHes companies whose values actually
// changed, so record timelines stay quiet.
export const mirrorCompanies = async (
  config: SyncConfig,
  { dryRun }: { dryRun: boolean },
): Promise<MirrorReport> => {
  const twenty = new TwentyClient(config);

  const companies = (await twenty.findAllCompanies()).filter(
    (company) => (company.debtorNumber ?? '').trim() !== '',
  );

  const debtorNumbers = [
    ...new Set(companies.map((c) => c.debtorNumber!.trim())),
  ];

  const found = new Map<string, ErpCustomerSnapshot>();
  const financials = new Map<string, ErpCustomerFinancials>();

  for (let i = 0; i < debtorNumbers.length; i += ERP_BATCH_SIZE) {
    const slice = debtorNumbers.slice(i, i + ERP_BATCH_SIZE);
    const batch = await fetchErpCustomers(config, slice);

    for (const [key, value] of batch.found) {
      found.set(key, value);
    }

    const financialsBatch = await fetchErpFinancials(config, slice);

    for (const [key, value] of financialsBatch.found) {
      financials.set(key, value);
    }
  }

  const syncStamp = new Date().toISOString();
  const outcomes: CompanyOutcome[] = [];

  for (const company of companies) {
    const debtorNumber = company.debtorNumber!.trim();

    try {
      const snapshot = found.get(debtorNumber);

      if (snapshot === undefined) {
        outcomes.push({ company, outcome: 'notInErp' });
        continue;
      }

      if (snapshot.internal) {
        outcomes.push({ company, outcome: 'internal' });
        continue;
      }

      const { fields, unmapped } = buildMirrorFields(snapshot);

      // Financial mirror: the aggregates carry no currency, so the money
      // fields borrow the customer's currency from the snapshot.
      const customerFinancials = financials.get(debtorNumber);

      if (customerFinancials !== undefined) {
        const financialPayload = buildFinancialFields(
          customerFinancials,
          snapshot.currency || 'AED',
        );

        Object.assign(fields, financialPayload.fields);
        unmapped.push(...financialPayload.unmapped);
      }

      const changed: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(fields)) {
        if (valuesDiffer(company[key as keyof MirrorCompany], value)) {
          changed[key] = value;
        }
      }

      const changedFields = Object.keys(changed);

      // lastSyncAt is a freshness flag, not a change marker: every company the
      // run successfully checked gets stamped, so stale-data automations can
      // trust it even when nothing else moved.
      if (!dryRun) {
        await twenty.updateCompany(company.id, {
          ...changed,
          lastSyncAt: syncStamp,
        });
      }

      if (changedFields.length === 0) {
        outcomes.push({ company, outcome: 'unchanged' });
        continue;
      }

      outcomes.push({ company, outcome: 'updated', changedFields, unmapped });
    } catch (error) {
      outcomes.push({
        company,
        outcome: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { dryRun, totalCompanies: companies.length, outcomes };
};
