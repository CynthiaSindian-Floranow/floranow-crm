import { LEAD_REGISTRATION_EXPORT_TEMPLATE } from '@/object-record/record-index/export/constants/LeadRegistrationExportTemplate';
import { buildLeadRegistrationWorkbook } from '@/object-record/record-index/export/utils/buildLeadRegistrationWorkbook';
import { strFromU8, unzipSync } from 'fflate';
import * as XLSX from 'xlsx-ugnis';

const COLUMN_COUNT = LEAD_REGISTRATION_EXPORT_TEMPLATE.columns.length;

const emptyRow = () => new Array<string>(COLUMN_COUNT).fill('');

const rowWith = (values: Record<number, string>) => {
  const row = emptyRow();

  for (const [index, value] of Object.entries(values)) {
    row[Number(index)] = value;
  }

  return row;
};

const readSheetXml = (workbook: Uint8Array) =>
  strFromU8(unzipSync(workbook)['xl/worksheets/sheet1.xml']);

describe('buildLeadRegistrationWorkbook', () => {
  it('should keep the dropdowns the marketplace template ships with', () => {
    const sheet = readSheetXml(
      buildLeadRegistrationWorkbook({
        columnCount: COLUMN_COUNT,
        rows: [rowWith({ 0: 'a@b.com' })],
      }),
    );

    // SheetJS drops these on write, which is why the workbook is edited as a zip.
    expect(sheet).toContain('<dataValidations count="4"');
    expect(sheet).toContain('sqref="T2:T498"');
  });

  it('should keep the Lists sheet and its named ranges', () => {
    const workbook = XLSX.read(
      buildLeadRegistrationWorkbook({
        columnCount: COLUMN_COUNT,
        rows: [emptyRow()],
      }),
      { type: 'array' },
    );

    expect(workbook.SheetNames).toEqual(['Customers', 'Lists']);
    expect((workbook.Workbook?.Names ?? []).map((name) => name.Name)).toEqual(
      expect.arrayContaining(['Countries_', 'Cities_Saudi_Arabia']),
    );
  });

  it('should write the values into the right cells, with leadId appended', () => {
    const workbook = XLSX.read(
      buildLeadRegistrationWorkbook({
        columnCount: COLUMN_COUNT,
        rows: [
          rowWith({ 0: 'sara@rose.co', 1: 'RESELLER', 54: 'lead-1' }),
          rowWith({ 0: 'omar@bloom.ae', 1: 'CIF', 54: 'lead-2' }),
        ],
      }),
      { type: 'array' },
    );

    const rows = XLSX.utils.sheet_to_json<string[]>(
      workbook.Sheets['Customers'],
      { header: 1, defval: '' },
    );

    expect(rows[0][0]).toBe('Email *');
    expect(rows[0].at(-1)).toBe('leadId');
    expect(rows[1][0]).toBe('sara@rose.co');
    expect(rows[1][1]).toBe('RESELLER');
    expect(rows[1].at(-1)).toBe('lead-1');
    expect(rows[2].at(-1)).toBe('lead-2');
  });

  it('should escape values that would otherwise break the XML', () => {
    const workbook = XLSX.read(
      buildLeadRegistrationWorkbook({
        columnCount: COLUMN_COUNT,
        rows: [rowWith({ 3: 'Rose & Co <"best">' })],
      }),
      { type: 'array' },
    );

    expect(
      XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['Customers'], {
        header: 1,
        defval: '',
      })[1][3],
    ).toBe('Rose & Co <"best">');
  });

  it('should produce a header-only workbook when there is nothing to export', () => {
    const sheet = readSheetXml(
      buildLeadRegistrationWorkbook({ columnCount: COLUMN_COUNT, rows: [] }),
    );

    expect(sheet).toContain('<dataValidations count="4"');
    expect(sheet.match(/<row /g)).toHaveLength(1);
  });
});
