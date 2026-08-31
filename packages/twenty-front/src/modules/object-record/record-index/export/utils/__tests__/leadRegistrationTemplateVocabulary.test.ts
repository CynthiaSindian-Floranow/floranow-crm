import localityDataset from '@/localities/generated/localityDataset.json';
import { type LocalityDataset } from '@/localities/types/LocalityDataset';
import { LEAD_REGISTRATION_CITY_ALIASES } from '@/object-record/record-index/export/constants/LeadRegistrationCityAliases';
import { LEAD_REGISTRATION_EXPORT_TEMPLATE } from '@/object-record/record-index/export/constants/LeadRegistrationExportTemplate';
import { LEAD_REGISTRATION_TEMPLATE_COUNTRIES } from '@/object-record/record-index/export/constants/LeadRegistrationTemplateCountries';
import { LEAD_REGISTRATION_USER_CATEGORY_BY_VALUE } from '@/object-record/record-index/export/constants/LeadRegistrationUserCategories';
import { normalizeTemplateText } from '@/object-record/record-index/export/utils/normalizeTemplateText';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx-ugnis';

// Reads the marketplace workbook this export writes into, and fails if what we
// emit has drifted from what it accepts. Cheaper to catch here than in a
// rejected import.
const TEMPLATE_PATH = resolve(
  __dirname,
  '../../../../../../../scripts/lead-registration-data/qualified-leads.xlsx',
);

const workbook = XLSX.read(readFileSync(TEMPLATE_PATH), { type: 'buffer' });

const readNamedRange = (name: string): string[] => {
  const definedName = (workbook.Workbook?.Names ?? []).find(
    (entry) => entry.Name === name,
  );

  if (definedName === undefined) {
    throw new Error(`Template has no named range "${name}"`);
  }

  const [start, end] = definedName.Ref.replace('Lists!', '')
    .replace(/\$/g, '')
    .split(':');

  const from = XLSX.utils.decode_cell(start);
  const to = XLSX.utils.decode_cell(end);
  const sheet = workbook.Sheets['Lists'];
  const values: string[] = [];

  for (let row = from.r; row <= to.r; row++) {
    const cell = sheet[XLSX.utils.encode_cell({ c: from.c, r: row })];

    if (cell !== undefined && String(cell.v).trim() !== '') {
      values.push(String(cell.v));
    }
  }

  return values;
};

const dataset = localityDataset as unknown as LocalityDataset;

describe('the lead registration export against the marketplace template', () => {
  it('should emit the template’s own column headers, in its order', () => {
    const templateHeaders = XLSX.utils.sheet_to_json<string[]>(
      workbook.Sheets['Customers'],
      { header: 1, defval: '' },
    )[0];

    const ourHeaders = LEAD_REGISTRATION_EXPORT_TEMPLATE.columns.map(
      (column) => column.header,
    );

    // Ours is the template's 54 columns plus leadId appended for the round trip.
    expect(ourHeaders.slice(0, templateHeaders.length)).toEqual(
      templateHeaders,
    );
    expect(ourHeaders).toHaveLength(templateHeaders.length + 1);
    expect(ourHeaders.at(-1)).toBe('leadId');
  });

  it('should list exactly the countries the template accepts', () => {
    expect([...LEAD_REGISTRATION_TEMPLATE_COUNTRIES].sort()).toEqual(
      [...readNamedRange('Countries_')].sort(),
    );
  });

  it('should spell every emittable city the way the template does', () => {
    const rangeByCountry: Record<string, string> = {
      Iraq: 'Cities_Iraq',
      Jordan: 'Cities_Jordan',
      Kuwait: 'Cities_Kuwait',
      Qatar: 'Cities_Qatar',
      'Saudi Arabia': 'Cities_Saudi_Arabia',
      'United Arab Emirates': 'Cities_United_Arab_Emirates',
    };

    for (const country of LEAD_REGISTRATION_TEMPLATE_COUNTRIES) {
      const allowed = new Set(readNamedRange(rangeByCountry[country]));

      const emittable = Object.values(dataset)
        .find((entry) => entry.n === country)!
        .c.map(([cityName]) => normalizeTemplateText(cityName));

      const rejected = emittable.filter((city) => !allowed.has(city));

      expect({ country, rejected }).toEqual({ country, rejected: [] });
    }
  });

  it('should only alias legacy cities onto spellings the template lists', () => {
    const rangeByCountry: Record<string, string> = {
      Iraq: 'Cities_Iraq',
      Jordan: 'Cities_Jordan',
      Kuwait: 'Cities_Kuwait',
      Qatar: 'Cities_Qatar',
      'Saudi Arabia': 'Cities_Saudi_Arabia',
      'United Arab Emirates': 'Cities_United_Arab_Emirates',
    };

    const rejected = Object.entries(LEAD_REGISTRATION_CITY_ALIASES)
      .filter(([key, city]) => {
        const country = key.split('|')[0];

        return !readNamedRange(rangeByCountry[country]).includes(city);
      })
      .map(([key, city]) => `${key} -> ${city}`);

    expect(rejected).toEqual([]);
  });

  it('should use the template’s customer type vocabulary', () => {
    // The CRM stores these values verbatim, so the two lists must be identical.
    expect([...readNamedRange('CustomerTypes_')].sort()).toEqual(
      ['CIF', 'FOB', 'RESELLER', 'RETAIL'].sort(),
    );
  });

  it('should map every user category onto the template’s list, or to blank', () => {
    const allowed = new Set(readNamedRange('UserCategories_'));

    const rejected = Object.entries(LEAD_REGISTRATION_USER_CATEGORY_BY_VALUE)
      .filter(([, mapped]) => mapped !== '' && !allowed.has(mapped))
      .map(([value, mapped]) => `${value} -> ${mapped}`);

    expect(rejected).toEqual([]);
  });

  it('should have a Segment list matching Buyer Segment’s labels', () => {
    expect(readNamedRange('Segments_')).toEqual([
      'Retail',
      'Online Florists',
      'Supermarkets',
      'Hotels',
      'Wedding and events',
      'Wholesalers',
    ]);
  });
});
