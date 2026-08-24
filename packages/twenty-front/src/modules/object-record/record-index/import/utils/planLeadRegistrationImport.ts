import {
  type LeadRegistrationImportPlan,
  type LeadRegistrationImportRow,
  type LeadRegistrationImportRowResult,
} from '@/object-record/record-index/import/types/LeadRegistrationImportRow';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { isDefined } from 'twenty-shared/utils';

type PlanLeadRegistrationImportOptions = {
  rows: LeadRegistrationImportRow[];
  // The Leads matching the ids found in the file, keyed by id.
  existingLeadsById: Map<string, ObjectRecord>;
};

const normalize = (value: string | null | undefined): string =>
  (value ?? '').trim();

// Decides what the import will do to every row without touching the network, so
// the same result can be shown as a preview and then applied.
export const planLeadRegistrationImport = ({
  rows,
  existingLeadsById,
}: PlanLeadRegistrationImportOptions): LeadRegistrationImportPlan => {
  const rowResults = rows.map<LeadRegistrationImportRowResult>((row, index) => {
    const leadId = normalize(row.leadId);
    const debtorNumber = normalize(row.debtorNumber);

    const base = { rowIndex: index, leadId, debtorNumber };

    // Checked before the lead lookup: an empty cell means "not registered yet",
    // which is the normal state of most rows in a partially filled sheet.
    if (debtorNumber === '') {
      return { ...base, outcome: 'skippedNoDebtorNumber' };
    }

    if (leadId === '') {
      return { ...base, outcome: 'skippedMissingLeadId' };
    }

    const existingLead = existingLeadsById.get(leadId);

    if (!isDefined(existingLead)) {
      return { ...base, outcome: 'skippedLeadNotFound' };
    }

    const existingDebtorNumber = normalize(existingLead.debtorNumber);

    if (existingDebtorNumber === debtorNumber) {
      return { ...base, outcome: 'unchanged' };
    }

    if (existingDebtorNumber !== '') {
      return { ...base, outcome: 'conflict', existingDebtorNumber };
    }

    return { ...base, outcome: 'updated' };
  });

  const debtorNumberCounts = new Map<string, number>();

  for (const rowResult of rowResults) {
    if (rowResult.debtorNumber === '') {
      continue;
    }

    debtorNumberCounts.set(
      rowResult.debtorNumber,
      (debtorNumberCounts.get(rowResult.debtorNumber) ?? 0) + 1,
    );
  }

  return {
    rowResults,
    rowsToUpdate: rowResults.filter(
      (rowResult) => rowResult.outcome === 'updated',
    ),
    duplicatedDebtorNumbers: [...debtorNumberCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([debtorNumber]) => debtorNumber),
  };
};
