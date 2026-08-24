import { LEAD_REGISTRATION_EXPORT_TEMPLATE } from '@/object-record/record-index/export/constants/LeadRegistrationExportTemplate';
import { type RecordExportTemplate } from '@/object-record/record-index/export/types/RecordExportTemplate';
import { generateCsvFromTemplate } from '@/object-record/record-index/export/utils/generateCsvFromTemplate';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

const LEAD_ID = '11111111-1111-4111-8111-111111111111';

const MARKETPLACE_HEADER =
  'email,customerType,currency,name,businessName,phoneNumber,segmentId,salesChannelId,country,city,state';

const EXPECTED_HEADER = `${MARKETPLACE_HEADER},leadId,debtorNumber`;

const buildLead = (overrides: Partial<ObjectRecord> = {}): ObjectRecord =>
  ({
    id: LEAD_ID,
    name: 'Rose Flowers',
    businessName: 'Rose Flowers LLC',
    customerType: 'RETAIL',
    billingCurrency: 'AED',
    country: 'AE',
    city: 'AE-DXB',
    state: 'AE-DU',
    pointOfContact: {
      id: '22222222-2222-4222-8222-222222222222',
      emails: { primaryEmail: 'a@x.ae', additionalEmails: null },
      phones: {
        primaryPhoneNumber: '501234567',
        primaryPhoneCallingCode: '+971',
        primaryPhoneCountryCode: 'AE',
        additionalPhones: null,
      },
    },
    ...overrides,
  }) as ObjectRecord;

const generate = (records: ObjectRecord[]) =>
  generateCsvFromTemplate({
    template: LEAD_REGISTRATION_EXPORT_TEMPLATE,
    records,
  });

describe('generateCsvFromTemplate', () => {
  it('should emit the marketplace header in the exact template order', () => {
    const lines = generate([buildLead()]).split('\n');

    expect(lines[0]).toBe(EXPECTED_HEADER);
  });

  it('should keep the marketplace columns first and unchanged, with the round-trip pair appended', () => {
    const headers = generate([buildLead()]).split('\n')[0].split(',');

    expect(headers.slice(0, 11).join(',')).toBe(MARKETPLACE_HEADER);
    expect(headers.slice(11)).toEqual(['leadId', 'debtorNumber']);
  });

  it('should export the lead id so the file can be matched on the way back', () => {
    const [header, row] = generate([buildLead()]).split('\n');
    const values = row.split(',');

    expect(values[header.split(',').indexOf('leadId')]).toBe(LEAD_ID);
  });

  it('should leave debtorNumber empty on export for the operator to fill in', () => {
    const [header, row] = generate([buildLead()]).split('\n');
    const values = row.split(',');

    expect(values[header.split(',').indexOf('debtorNumber')]).toBe('');
  });

  it('should not prefix the output with a byte order mark', () => {
    expect(generate([buildLead()]).charCodeAt(0)).not.toBe(0xfeff);
  });

  it('should map every lead field to its template column', () => {
    const lines = generate([buildLead()]).split('\n');

    expect(lines[1]).toBe(
      `a@x.ae,RETAIL,AED,Rose Flowers,Rose Flowers LLC,+971501234567,,,AE,AE-DXB,AE-DU,${LEAD_ID},`,
    );
  });

  it('should export segmentId and salesChannelId as empty placeholder columns', () => {
    const [header, row] = generate([buildLead()]).split('\n');
    const headers = header.split(',');
    const values = row.split(',');

    expect(values[headers.indexOf('segmentId')]).toBe('');
    expect(values[headers.indexOf('salesChannelId')]).toBe('');
  });

  it('should export blanks rather than "undefined" when the point of contact is missing', () => {
    const lines = generate([buildLead({ pointOfContact: null })]).split('\n');

    expect(lines[1]).toBe(
      `,RETAIL,AED,Rose Flowers,Rose Flowers LLC,,,,AE,AE-DXB,AE-DU,${LEAD_ID},`,
    );
    expect(lines[1]).not.toContain('undefined');
  });

  it('should export the phone without a zero-width joiner so the importer can read it', () => {
    const values = generate([buildLead()]).split('\n')[1].split(',');

    expect(values[5]).toBe('+971501234567');
    expect(values[5]).not.toContain('‍');
  });

  it('should strip separators from the phone before exporting it', () => {
    const lead = buildLead({
      pointOfContact: {
        id: '22222222-2222-4222-8222-222222222222',
        emails: { primaryEmail: 'a@x.ae', additionalEmails: null },
        phones: {
          primaryPhoneNumber: '50 123-4567',
          primaryPhoneCallingCode: '+971',
          primaryPhoneCountryCode: 'AE',
          additionalPhones: null,
        },
      },
    });

    expect(generate([lead]).split('\n')[1].split(',')[5]).toBe('+971501234567');
  });

  it('should export a blank phone rather than smuggle an unsanitised value through', () => {
    const lead = buildLead({
      pointOfContact: {
        id: '22222222-2222-4222-8222-222222222222',
        emails: { primaryEmail: 'a@x.ae', additionalEmails: null },
        phones: {
          primaryPhoneNumber: '=HYPERLINK("http://evil")',
          primaryPhoneCallingCode: '',
          primaryPhoneCountryCode: 'AE',
          additionalPhones: null,
        },
      },
    });

    const csv = generate([lead]);

    expect(csv.split('\n')[1].split(',')[5]).toBe('');
    expect(csv).not.toContain('HYPERLINK');
  });

  it('should export a blank phone when the contact has no phone number', () => {
    const lead = buildLead({
      pointOfContact: {
        id: '22222222-2222-4222-8222-222222222222',
        emails: { primaryEmail: 'a@x.ae', additionalEmails: null },
        phones: {
          primaryPhoneNumber: '',
          primaryPhoneCallingCode: '+971',
          primaryPhoneCountryCode: 'AE',
          additionalPhones: null,
        },
      },
    });

    const values = generate([lead]).split('\n')[1].split(',');

    expect(values[5]).toBe('');
  });

  it('should export blanks for lead fields that were never filled in', () => {
    const lead = buildLead({
      businessName: null,
      billingCurrency: null,
      country: null,
      city: null,
      state: null,
    });

    const lines = generate([lead]).split('\n');

    expect(lines[1]).toBe(
      `a@x.ae,RETAIL,,Rose Flowers,,+971501234567,,,,,,${LEAD_ID},`,
    );
  });

  it('should quote values containing commas, quotes or newlines', () => {
    const lead = buildLead({
      name: 'Rose, Flowers',
      businessName: 'Rose "Best" LLC',
      city: 'Dubai\nMarina',
    });

    const csv = generate([lead]);

    expect(csv).toContain('"Rose, Flowers"');
    expect(csv).toContain('"Rose ""Best"" LLC"');
    expect(csv).toContain('"Dubai\nMarina"');
  });

  it('should keep one row per lead', () => {
    const csv = generate([
      buildLead(),
      buildLead({
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Tulip Co',
      }),
    ]);

    expect(csv.split('\n')).toHaveLength(3);
  });

  it('should neutralise formula injection while preserving the original text', () => {
    const csv = generate([buildLead({ businessName: '=cmd|calc' })]);

    expect(csv).toContain('cmd|calc');
    expect(csv).not.toMatch(/,=cmd\|calc/);
  });

  it('should support placeholder-only templates without throwing', () => {
    const template: RecordExportTemplate = {
      filename: 'placeholders.csv',
      recordGqlFields: { id: true },
      columns: [{ header: 'a' }, { header: 'b' }],
    };

    const csv = generateCsvFromTemplate({ template, records: [buildLead()] });

    expect(csv.split('\n')).toEqual(['a,b', ',']);
  });
});
