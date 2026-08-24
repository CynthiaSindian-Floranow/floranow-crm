import { planLeadRegistrationImport } from '@/object-record/record-index/import/utils/planLeadRegistrationImport';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

const LEAD_A = '11111111-1111-4111-8111-111111111111';
const LEAD_B = '22222222-2222-4222-8222-222222222222';

const buildLead = (id: string, debtorNumber: string | null): ObjectRecord =>
  ({ id, debtorNumber }) as unknown as ObjectRecord;

const existingLeads = (...leads: ObjectRecord[]) =>
  new Map(leads.map((lead) => [lead.id, lead]));

describe('planLeadRegistrationImport', () => {
  it('should update a lead whose debtor number is still empty', () => {
    const plan = planLeadRegistrationImport({
      rows: [{ leadId: LEAD_A, debtorNumber: 'D-100' }],
      existingLeadsById: existingLeads(buildLead(LEAD_A, '')),
    });

    expect(plan.rowResults[0].outcome).toBe('updated');
    expect(plan.rowsToUpdate).toHaveLength(1);
  });

  it('should treat a null debtor number on the lead as empty', () => {
    const plan = planLeadRegistrationImport({
      rows: [{ leadId: LEAD_A, debtorNumber: 'D-100' }],
      existingLeadsById: existingLeads(buildLead(LEAD_A, null)),
    });

    expect(plan.rowResults[0].outcome).toBe('updated');
  });

  it('should skip rows whose debtor number cell is still empty', () => {
    const plan = planLeadRegistrationImport({
      rows: [{ leadId: LEAD_A, debtorNumber: '' }],
      existingLeadsById: existingLeads(buildLead(LEAD_A, '')),
    });

    expect(plan.rowResults[0].outcome).toBe('skippedNoDebtorNumber');
    expect(plan.rowsToUpdate).toHaveLength(0);
  });

  it('should skip a row that has a debtor number but no lead id', () => {
    const plan = planLeadRegistrationImport({
      rows: [{ leadId: '   ', debtorNumber: 'D-100' }],
      existingLeadsById: existingLeads(),
    });

    expect(plan.rowResults[0].outcome).toBe('skippedMissingLeadId');
  });

  it('should skip a lead id that does not exist, rather than creating anything', () => {
    const plan = planLeadRegistrationImport({
      rows: [{ leadId: LEAD_B, debtorNumber: 'D-100' }],
      existingLeadsById: existingLeads(buildLead(LEAD_A, '')),
    });

    expect(plan.rowResults[0].outcome).toBe('skippedLeadNotFound');
    expect(plan.rowsToUpdate).toHaveLength(0);
  });

  it('should be a no-op when the lead already carries the same number', () => {
    const plan = planLeadRegistrationImport({
      rows: [{ leadId: LEAD_A, debtorNumber: 'D-100' }],
      existingLeadsById: existingLeads(buildLead(LEAD_A, 'D-100')),
    });

    expect(plan.rowResults[0].outcome).toBe('unchanged');
    expect(plan.rowsToUpdate).toHaveLength(0);
  });

  it('should never overwrite a different existing debtor number', () => {
    const plan = planLeadRegistrationImport({
      rows: [{ leadId: LEAD_A, debtorNumber: 'D-999' }],
      existingLeadsById: existingLeads(buildLead(LEAD_A, 'D-100')),
    });

    expect(plan.rowResults[0].outcome).toBe('conflict');
    expect(plan.rowResults[0].existingDebtorNumber).toBe('D-100');
    expect(plan.rowsToUpdate).toHaveLength(0);
  });

  it('should ignore surrounding whitespace from the spreadsheet', () => {
    const plan = planLeadRegistrationImport({
      rows: [{ leadId: `  ${LEAD_A} `, debtorNumber: '  D-100  ' }],
      existingLeadsById: existingLeads(buildLead(LEAD_A, '')),
    });

    expect(plan.rowResults[0].outcome).toBe('updated');
    expect(plan.rowsToUpdate[0].debtorNumber).toBe('D-100');
  });

  it('should flag a debtor number reused across rows', () => {
    const plan = planLeadRegistrationImport({
      rows: [
        { leadId: LEAD_A, debtorNumber: 'D-100' },
        { leadId: LEAD_B, debtorNumber: 'D-100' },
      ],
      existingLeadsById: existingLeads(
        buildLead(LEAD_A, ''),
        buildLead(LEAD_B, ''),
      ),
    });

    expect(plan.duplicatedDebtorNumbers).toEqual(['D-100']);
  });

  it('should not flag duplicates when every debtor number is distinct', () => {
    const plan = planLeadRegistrationImport({
      rows: [
        { leadId: LEAD_A, debtorNumber: 'D-100' },
        { leadId: LEAD_B, debtorNumber: 'D-200' },
      ],
      existingLeadsById: existingLeads(
        buildLead(LEAD_A, ''),
        buildLead(LEAD_B, ''),
      ),
    });

    expect(plan.duplicatedDebtorNumbers).toEqual([]);
  });

  it('should be idempotent: applying a plan twice changes nothing the second time', () => {
    const rows = [{ leadId: LEAD_A, debtorNumber: 'D-100' }];

    const firstPlan = planLeadRegistrationImport({
      rows,
      existingLeadsById: existingLeads(buildLead(LEAD_A, '')),
    });

    // Simulate the write having happened, then re-import the same file.
    const secondPlan = planLeadRegistrationImport({
      rows,
      existingLeadsById: existingLeads(
        buildLead(LEAD_A, firstPlan.rowsToUpdate[0].debtorNumber),
      ),
    });

    expect(firstPlan.rowsToUpdate).toHaveLength(1);
    expect(secondPlan.rowsToUpdate).toHaveLength(0);
    expect(secondPlan.rowResults[0].outcome).toBe('unchanged');
  });

  it('should classify a mixed sheet row by row', () => {
    const plan = planLeadRegistrationImport({
      rows: [
        { leadId: LEAD_A, debtorNumber: 'D-100' },
        { leadId: LEAD_B, debtorNumber: '' },
        { leadId: 'not-a-lead', debtorNumber: 'D-300' },
      ],
      existingLeadsById: existingLeads(
        buildLead(LEAD_A, ''),
        buildLead(LEAD_B, ''),
      ),
    });

    expect(plan.rowResults.map((row) => row.outcome)).toEqual([
      'updated',
      'skippedNoDebtorNumber',
      'skippedLeadNotFound',
    ]);
    expect(plan.rowsToUpdate).toHaveLength(1);
  });
});
