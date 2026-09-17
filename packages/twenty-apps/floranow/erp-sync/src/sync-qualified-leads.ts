import { type SyncConfig } from './env';
import { fetchErpCustomers, type ErpCustomerSnapshot } from './erp-client';
import { buildCompanyPayload, type UnmappedValue } from './mapping';
import { TwentyClient, type Lead } from './twenty-client';

export type LeadOutcome = {
  lead: Lead;
  outcome:
    | 'created' // Company created from the ERP snapshot, lead converted
    | 'attached' // Company with this debtor number already existed
    | 'waitingForErp' // debtor number not in the ERP yet — untouched
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
//   * no filtering by customer type — every lead in scope is processed;
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

      const existing = await twenty.findCompanyByDebtorNumber(debtorNumber);

      if (existing !== null) {
        if (!dryRun) {
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
        });
        continue;
      }

      const snapshot = erpResult.found.get(debtorNumber);

      if (snapshot === undefined) {
        outcomes.push({ lead, outcome: 'waitingForErp' });
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

      if (lead.ownerId !== null) {
        fields.accountOwnerId = lead.ownerId;
      }

      let companyId = '(dry-run)';
      let contactWarning: string | undefined;

      if (!dryRun) {
        const company = await twenty.createCompany(fields);

        companyId = company.id;

        // The contact is secondary — a bad phone or email must not leave the
        // lead stuck in Qualified with an orphaned Company behind it.
        try {
          contactWarning = await linkContact(twenty, lead, snapshot, companyId);
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
// them onto the Company. Only when the lead has none is a Person created from
// the ERP's contact details. Returns a warning when the contact landed in a
// degraded form.
const linkContact = async (
  twenty: TwentyClient,
  lead: Lead,
  snapshot: ErpCustomerSnapshot,
  companyId: string,
): Promise<string | undefined> => {
  if (lead.pointOfContactId !== null) {
    await twenty.attachPersonToCompany(lead.pointOfContactId, companyId);

    return undefined;
  }

  if (!snapshot.email && !snapshot.phone_number) {
    return undefined;
  }

  const contactName = (snapshot.name ?? '').trim();
  const [firstName, ...rest] = contactName.split(/\s+/);

  const personFields = {
    name: {
      firstName: firstName || snapshot.business_name || lead.name,
      lastName: rest.join(' '),
    },
    emails: snapshot.email ? { primaryEmail: snapshot.email } : undefined,
    phones: snapshot.phone_number
      ? { primaryPhoneNumber: snapshot.phone_number }
      : undefined,
    companyId,
  };

  try {
    await twenty.createPerson(personFields);

    return undefined;
  } catch (error) {
    // ERP phone numbers are not always internationally formatted and Twenty
    // rejects the invalid ones. The contact still matters — retry without the
    // phone rather than losing the person.
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes('INVALID_PHONE_NUMBER')) {
      throw error;
    }

    await twenty.createPerson({ ...personFields, phones: undefined });

    return `contact created without phone — ERP phone "${snapshot.phone_number}" was rejected as invalid`;
  }
};
