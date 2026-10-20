import { type SyncConfig } from './env';
import {
  fetchErpCustomers,
  fetchErpFinancials,
  type ErpCustomerFinancials,
  type ErpCustomerSnapshot,
} from './erp-client';
import { changedFieldsOnly } from './diff';
import {
  buildFinancialFields,
  buildMirrorFields,
  computeAccountStatus,
  computeLifecycleStage,
  computeProtectedClear,
  isCodViolation,
  mapPaymentTerm,
  shouldCreateInactivityTask,
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

export type InactivityTaskOutcome = {
  companyName: string;
  outcome: 'created' | 'wouldCreate' | 'noOwner';
};

export type CodIncidentOutcome = {
  companyName: string;
  outcome: 'created' | 'wouldCreate' | 'resolved' | 'wouldResolve';
};

export type MirrorReport = {
  dryRun: boolean;
  totalCompanies: number;
  outcomes: CompanyOutcome[];
  inactivityTasks: InactivityTaskOutcome[];
  codIncidents: CodIncidentOutcome[];
};

const ERP_BATCH_SIZE = 100;

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
  const inactivityTasks: InactivityTaskOutcome[] = [];
  const codIncidents: CodIncidentOutcome[] = [];

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

        // Account status follows the clock (D2) — computed from the facts
        // this run just mirrored. null = hands off (manual-only state).
        const computedStatus = computeAccountStatus(
          company.accountStatus,
          snapshot.blocked,
          customerFinancials.orders.lifetime_count ?? null,
          (financialPayload.fields.daysSinceLastOrder as number | null) ?? null,
        );

        if (computedStatus !== null) {
          fields.accountStatus = computedStatus;
        }

        // Two clocks (option B): lifecycle hops Onboarding → Retention at the
        // 3rd order, regardless of the protected window.
        const lifecycle = computeLifecycleStage(
          company.lifecycleStage,
          customerFinancials.orders.lifetime_count ?? null,
        );

        if (lifecycle !== null) {
          fields.lifecycleStage = lifecycle;
        }

        // Inactivity nudge (item 5): first quiet crossing (21–45 days, no
        // sub-tag yet) → one open task for the owner to record the reason.
        // One task per account at a time; ownerless accounts are reported.
        if (
          shouldCreateInactivityTask(
            company.inactivitySubTag,
            customerFinancials.orders.lifetime_count ?? null,
            (financialPayload.fields.daysSinceLastOrder as number | null) ??
              null,
          )
        ) {
          const ownerId =
            typeof company.accountOwnerId === 'string' &&
            company.accountOwnerId !== ''
              ? company.accountOwnerId
              : null;

          if (ownerId === null) {
            inactivityTasks.push({
              companyName: company.name,
              outcome: 'noOwner',
            });
          } else if (!(await hasOpenInactivityTask(twenty, company.id))) {
            if (dryRun) {
              inactivityTasks.push({
                companyName: company.name,
                outcome: 'wouldCreate',
              });
            } else {
              const task = await twenty.createTask({
                title: `Set inactivity reason — ${company.name}`,
                status: 'TODO',
                dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
                assigneeId: ownerId,
              });

              await twenty.createTaskTarget(task.id, company.id);
              inactivityTasks.push({
                companyName: company.name,
                outcome: 'created',
              });
            }
          }
        }

        // COD zero-balance rule (item 10): a COD account with a balance gets
        // one open High incident the day it appears; it resolves itself the
        // run the balance returns to zero. One open incident per account.
        const violation = isCodViolation(
          mapPaymentTerm(snapshot.payment_term),
          customerFinancials.receivable.total,
        );

        const openCodIncident = (
          await twenty.findChildrenByCompany('incidents', company.id)
        ).find(
          (incident) =>
            incident.category === 'COD_VIOLATION' &&
            incident.status === 'OPEN',
        );

        if (violation && openCodIncident === undefined) {
          if (dryRun) {
            codIncidents.push({
              companyName: company.name,
              outcome: 'wouldCreate',
            });
          } else {
            await twenty.createChild('incidents', {
              name: `COD violation — ${company.name}`,
              category: 'COD_VIOLATION',
              severity: 'HIGH',
              status: 'OPEN',
              companyId: company.id,
            });
            codIncidents.push({ companyName: company.name, outcome: 'created' });
          }
        } else if (!violation && openCodIncident !== undefined) {
          if (dryRun) {
            codIncidents.push({
              companyName: company.name,
              outcome: 'wouldResolve',
            });
          } else {
            await twenty.updateChild('incidents', openCodIncident.id, {
              status: 'RESOLVED',
            });
            codIncidents.push({ companyName: company.name, outcome: 'resolved' });
          }
        }
      }

      // Protected window (D3): ends at day 60 after creation, and only then.
      const protectedClear = computeProtectedClear(
        company.newClientProtected,
        company.createdAt,
      );

      if (protectedClear !== null) {
        fields.newClientProtected = protectedClear;
      }

      const changed = changedFieldsOnly(
        fields,
        company as Record<string, unknown>,
      );

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

  return {
    dryRun,
    totalCompanies: companies.length,
    outcomes,
    inactivityTasks,
    codIncidents,
  };
};

// An account has at most one open inactivity nudge at a time; a Done task
// means the reason was recorded (or the account reactivated) and a future
// quiet spell may create a fresh one.
const hasOpenInactivityTask = async (
  twenty: TwentyClient,
  companyId: string,
): Promise<boolean> => {
  const taskIds = await twenty.findTaskIdsForCompany(companyId);

  for (const taskId of taskIds) {
    const task = await twenty.findTask(taskId);

    if (
      task !== null &&
      (task.title ?? '').startsWith('Set inactivity reason') &&
      task.status !== 'DONE'
    ) {
      return true;
    }
  }

  return false;
};
