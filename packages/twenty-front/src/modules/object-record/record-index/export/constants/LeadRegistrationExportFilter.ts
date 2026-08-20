import { type RecordGqlOperationFilter } from 'twenty-shared/types';

// Leads are only ready for registration once qualified, and a debtor number is
// what the marketplace writes back after registration -- so an empty one marks
// a lead that still needs to be sent. Existing rows store an empty string rather
// than NULL, so both cases have to be covered.
export const LEAD_REGISTRATION_EXPORT_FILTER: RecordGqlOperationFilter = {
  stage: { eq: 'QUALIFIED' },
  or: [{ debtorNumber: { is: 'NULL' } }, { debtorNumber: { eq: '' } }],
};
