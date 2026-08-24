export type LeadRegistrationImportRow = {
  leadId: string;
  debtorNumber: string;
};

export type LeadRegistrationImportOutcome =
  // Not registered yet -- the operator left the cell empty. Expected, not an error.
  | 'skippedNoDebtorNumber'
  // The row does not carry a usable leadId, so it cannot be matched.
  | 'skippedMissingLeadId'
  // The leadId is not a Lead in this workspace (wrong file, deleted lead, typo).
  | 'skippedLeadNotFound'
  // The lead already carries exactly this number: re-importing is a no-op.
  | 'unchanged'
  // The lead already carries a different number. Never overwritten.
  | 'conflict'
  | 'updated';

export type LeadRegistrationImportRowResult = {
  rowIndex: number;
  leadId: string;
  debtorNumber: string;
  outcome: LeadRegistrationImportOutcome;
  // Only set for 'conflict': what the lead currently holds.
  existingDebtorNumber?: string;
};

export type LeadRegistrationImportPlan = {
  rowResults: LeadRegistrationImportRowResult[];
  // Rows that should be written, in file order.
  rowsToUpdate: LeadRegistrationImportRowResult[];
  // Debtor numbers appearing on more than one row of the file.
  duplicatedDebtorNumbers: string[];
};
