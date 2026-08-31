import localityDataset from '@/localities/generated/localityDataset.json';
import { type LocalityDataset } from '@/localities/types/LocalityDataset';
import { LEAD_REGISTRATION_EXPORT_TEMPLATE } from '@/object-record/record-index/export/constants/LeadRegistrationExportTemplate';
import { buildLeadRegistrationRows } from '@/object-record/record-index/export/utils/buildLeadRegistrationRows';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

const dataset = localityDataset as unknown as LocalityDataset;

const BUYER_SEGMENT_LABELS = {
  RETAIL: 'Retail',
  ONLINE_FLORISTS: 'Online Florists',
  WEDDING_AND_EVENTS: 'Wedding and events',
};

const at = (row: string[], header: string) =>
  row[
    LEAD_REGISTRATION_EXPORT_TEMPLATE.columns.findIndex(
      (column) => column.header === header,
    )
  ];

const buildRow = (record: Partial<ObjectRecord>) =>
  buildLeadRegistrationRows({
    records: [record as ObjectRecord],
    dataset,
    buyerSegmentLabelByValue: BUYER_SEGMENT_LABELS,
  })[0];

describe('buildLeadRegistrationRows', () => {
  it('should produce one cell per template column', () => {
    expect(buildRow({ id: 'lead-1' })).toHaveLength(
      LEAD_REGISTRATION_EXPORT_TEMPLATE.columns.length,
    );
  });

  it('should fill the columns the CRM knows and leave the rest empty', () => {
    const row = buildRow({
      id: 'lead-1',
      businessName: 'Rose Co',
      customerType: 'RESELLER',
      billingCurrency: 'SAR',
      vatNumber: '300123456700003',
      buyerSegment: 'ONLINE_FLORISTS',
      customerCategory: 'RETAIL_SHOPS',
      country: 'Saudi Arabia',
      city: 'Riyadh',
      pointOfContact: {
        emails: { primaryEmail: 'sara@rose.co' },
        name: { firstName: 'Sara', lastName: 'Ali' },
        phones: {
          primaryPhoneCallingCode: '+966',
          primaryPhoneNumber: '500000000',
        },
      },
      owner: { name: { firstName: 'Samer', lastName: 'Sindian' } },
    });

    expect(at(row, 'Email *')).toBe('sara@rose.co');
    expect(at(row, 'Customer type *')).toBe('RESELLER');
    expect(at(row, 'Contact name *')).toBe('Sara Ali');
    expect(at(row, 'Business name *')).toBe('Rose Co');
    expect(at(row, 'Phone number *')).toBe('+966500000000');
    expect(at(row, 'VAT number')).toBe('300123456700003');
    expect(at(row, 'Currency *')).toBe('SAR');
    expect(at(row, 'Segment')).toBe('Online Florists');
    expect(at(row, 'Country')).toBe('Saudi Arabia');
    expect(at(row, 'City')).toBe('Riyadh');
    expect(at(row, 'User category')).toBe('Retail Shops');
    expect(at(row, 'Account manager')).toBe('Samer Sindian');
    expect(at(row, 'leadId')).toBe('lead-1');

    // Left for a human to complete in Excel.
    expect(at(row, 'Debtor number')).toBe('');
    expect(at(row, 'Incoterm')).toBe('');
    expect(at(row, 'Consignee region')).toBe('');
  });

  it('should translate the legacy country and city spellings in the data', () => {
    const row = buildRow({ id: 'l', country: 'ksa', city: 'riyadh' });

    expect(at(row, 'Country')).toBe('Saudi Arabia');
    expect(at(row, 'City')).toBe('Riyadh');
  });

  it('should blank a country the template does not accept, and its city', () => {
    const row = buildRow({ id: 'l', country: 'Germany', city: 'Berlin' });

    expect(at(row, 'Country')).toBe('');
    expect(at(row, 'City')).toBe('');
  });

  it('should blank a city the template does not list, keeping the country', () => {
    // Al Majmaah is genuinely absent from the template's Saudi city list.
    const row = buildRow({ id: 'l', country: 'ksa', city: 'al majmaah' });

    expect(at(row, 'Country')).toBe('Saudi Arabia');
    expect(at(row, 'City')).toBe('');
  });

  it('should alias the legacy city spellings prod actually holds', () => {
    const cityFor = (country: string, city: string) =>
      at(buildRow({ id: 'l', country, city }), 'City');

    // The template qualifies this one with "City".
    expect(cityFor('UAE', 'Al Ain')).toBe('Al Ain City');
    // Different romanisation.
    expect(cityFor('ksa', 'jazan')).toBe('Jizan');
    expect(cityFor('ksa', 'al jubail')).toBe('Al Jubayl');
    // A typo that made it into the data.
    expect(cityFor('ksa', 'khboar')).toBe('Khobar');
  });

  it('should strip the accents the template does not use', () => {
    const row = buildRow({ id: 'l', country: 'uae', city: 'Khawr Fakkān' });

    expect(at(row, 'City')).toBe('Khawr Fakkan');
  });

  it('should blank the two user categories the template has no place for', () => {
    expect(
      at(
        buildRow({ id: 'l', customerCategory: 'INTERNAL_USERS' }),
        'User category',
      ),
    ).toBe('');
    expect(
      at(
        buildRow({ id: 'l', customerCategory: 'INTERNAL_BUYERS' }),
        'User category',
      ),
    ).toBe('');
  });

  it('should use the template’s spelling of SuperMarkets', () => {
    expect(
      at(
        buildRow({ id: 'l', customerCategory: 'SUPERMARKETS' }),
        'User category',
      ),
    ).toBe('SuperMarkets');
  });
});
