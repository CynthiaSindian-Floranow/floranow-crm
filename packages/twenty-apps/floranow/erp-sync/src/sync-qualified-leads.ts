import { type SyncConfig } from './env';
import { fetchErpCustomers } from './erp-client';
import { buildCompanyPayload, type UnmappedValue } from './mapping';
import { TwentyClient, type Lead } from './twenty-client';

export type LeadOutcome = {
  lead: Lead;
  outcome:
    | 'created' // Company created from the ERP snapshot, lead converted
    | 'attached' // Company with this debtor number already existed
    | 'waitingForErp' // debtor number not in the ERP yet — untouched
    | 'needsOwner' // ready, but the lead has no owner — left Qualified
    | 'skippedInternal' // ERP marks the account internal — untouched
    | 'duplicateDebtorNumber' // another qualified lead carries the same number
    | 'error';
  companyId?: string;
  companyName?: string;
  unmapped?: UnmappedValue[];
  missingOwner?: boolean;
  contactWarning?: string;
  error?: string;
};

export type SyncReport = {
  dryRun: boolean;
  totalQualified: number;
  withDebtorNumber: number;
  outcomes: LeadOutcome[];
};

const hasDebtorNumber = (lead: Lead): boolean =>
  (lead.debtorNumber ?? '').trim() !== '';

// One qualified lead with a debtor number → at most one Company, ever.
// Rules honoured here:
//   * attach, never create, when the debtor number already has a Company;
//   * leads whose number the ERP does not know yet are left untouched;
//   * internal ERP accounts (staff/system users) are skipped and reported —
//     they are not clients and must not enter the CRM;
//   * no filtering by customer type (retail/reseller/FOB/CIF all process);
//   * only sync-owned fields are written (see buildCompanyPayload).
export const syncQualifiedLeads = async (
  config: SyncConfig,
  { dryRun }: { dryRun: boolean },
): Promise<SyncReport> => {
  const twenty = new TwentyClient(config);

  const qualified = await twenty.findQualifiedLeads();
  const leads = qualified.filter(hasDebtorNumber);

  const outcomes: LeadOutcome[] = [];
  const seenDebtorNumbers = new Set<string>();

  const erpResult = await fetchErpCustomers(
    config,
    [...new Set(leads.map((lead) => lead.debtorNumber!.trim()))],
  );

  for (const lead of leads) {
    const debtorNumber = lead.debtorNumber!.trim();

    try {
      if (seenDebtorNumbers.has(debtorNumber)) {
        outcomes.push({ lead, outcome: 'duplicateDebtorNumber' });
        continue;
      }

      seenDebtorNumbers.add(debtorNumber);

      // Checked before the attach path too: an internal account must not be
      // provisioned OR converted, even if a Company somehow carries its number.
      if (erpResult.found.get(debtorNumber)?.internal === true) {
        outcomes.push({ lead, outcome: 'skippedInternal' });
        continue;
      }

      const existing = await twenty.findCompanyByDebtorNumber(debtorNumber);

      if (existing !== null) {
        let attachContactWarning: string | undefined;

        if (!dryRun) {
          try {
            attachContactWarning = await linkContact(twenty, lead, existing.id);
          } catch (error) {
            attachContactWarning =
              error instanceof Error ? error.message : String(error);
          }

          await twenty.updateLead(lead.id, {
            companyId: existing.id,
            stage: 'CONVERTED',
          });
        }

        outcomes.push({
          lead,
          outcome: 'attached',
          companyId: existing.id,
          companyName: existing.name,
          missingOwner: lead.ownerId === null,
          contactWarning: attachContactWarning,
        });
        continue;
      }

      const snapshot = erpResult.found.get(debtorNumber);

      if (snapshot === undefined) {
        outcomes.push({ lead, outcome: 'waitingForErp' });
        continue;
      }

      // Owner rule (BRD: do not convert until an owner is set). A lead with no
      // owner would create a Company with no account manager — instead leave
      // it Qualified so it stays in the "Awaiting Provisioning" view until an
      // AM is assigned, then it converts on a later run.
      if (lead.ownerId === null) {
        outcomes.push({ lead, outcome: 'needsOwner' });
        continue;
      }

      const { fields, unmapped } = buildCompanyPayload(
        {
          name: lead.name,
          businessName: lead.businessName,
          source: lead.source,
          vatNumber: lead.vatNumber,
        },
        snapshot,
      );

      fields.accountOwnerId = lead.ownerId;

      let companyId = '(dry-run)';
      let contactWarning: string | undefined;

      if (!dryRun) {
        const company = await twenty.createCompany(fields);

        companyId = company.id;

        // The contact is secondary — a bad phone or email must not leave the
        // lead stuck in Qualified with an orphaned Company behind it.
        try {
          contactWarning = await linkContact(twenty, lead, companyId);
        } catch (error) {
          contactWarning =
            error instanceof Error ? error.message : String(error);
        }

        await twenty.updateLead(lead.id, {
          companyId,
          stage: 'CONVERTED',
        });
      }

      outcomes.push({
        lead,
        outcome: 'created',
        companyId,
        companyName: String(fields.name),
        unmapped,
        missingOwner: lead.ownerId === null,
        contactWarning,
      });
    } catch (error) {
      outcomes.push({
        lead,
        outcome: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    dryRun,
    totalQualified: qualified.length,
    withDebtorNumber: leads.length,
    outcomes,
  };
};

// The lead's point of contact is the person the AM already talks to — move
// them onto the Company. The pipeline never invents Person records (rule per
// Cynthia, 2026-09-29): a lead without a point of contact just gets a warning
// so the AM adds the person by hand. Returns that warning, or undefined.
const linkContact = async (
  twenty: TwentyClient,
  lead: Lead,
  companyId: string,
): Promise<string | undefined> => {
  if (lead.pointOfContactId === null) {
    return 'lead has no point of contact — no person linked to the Company';
  }

  await twenty.attachPersonToCompany(lead.pointOfContactId, companyId);

  return undefined;
};
