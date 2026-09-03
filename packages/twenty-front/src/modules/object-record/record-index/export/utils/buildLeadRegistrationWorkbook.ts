import { LEAD_REGISTRATION_TEMPLATE_BASE64 } from '@/object-record/record-index/export/generated/leadRegistrationTemplateBase64';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const SHEET_PATH = 'xl/worksheets/sheet1.xml';

// Excel's A, B, … Z, AA, AB … column naming.
const getColumnName = (columnIndex: number) => {
  let name = '';
  let remaining = columnIndex;

  while (remaining >= 0) {
    name = String.fromCharCode(65 + (remaining % 26)) + name;
    remaining = Math.floor(remaining / 26) - 1;
  }

  return name;
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// XML 1.0 forbids most control characters outright; a stray one makes the whole
// workbook unopenable, so they are dropped rather than escaped.
const stripInvalidXmlChars = (value: string) =>
  // eslint-disable-next-line no-control-regex
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const decodeBase64 = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

type BuildLeadRegistrationWorkbookOptions = {
  // One entry per lead, already in template column order. Every row must be the
  // same length as the header.
  rows: string[][];
  // Taken from the template rather than from the rows, so an export that matches
  // no leads still writes a correct header instead of collapsing to one column.
  columnCount: number;
};

// Injects rows into the marketplace's own workbook by rewriting a single XML
// part and leaving every other byte alone.
//
// SheetJS cannot be used for the write: it drops all five dataValidation blocks,
// which is exactly what makes the file usable by hand in Excel. `<sheetData>` is
// the first child element affected and `<dataValidations>` follows it, so
// replacing just that element preserves the dropdowns, the Lists sheet and the
// named ranges.
export const buildLeadRegistrationWorkbook = ({
  rows,
  columnCount,
}: BuildLeadRegistrationWorkbookOptions): Uint8Array<ArrayBuffer> => {
  const archive = unzipSync(decodeBase64(LEAD_REGISTRATION_TEMPLATE_BASE64));
  const sheet = strFromU8(archive[SHEET_PATH]);

  const sheetDataStart = sheet.indexOf('<sheetData>');
  const sheetDataEnd = sheet.indexOf('</sheetData>') + '</sheetData>'.length;

  if (sheetDataStart === -1 || sheetDataEnd < sheetDataStart) {
    throw new Error('Lead registration template has no <sheetData> to fill.');
  }

  const sheetData = sheet.slice(sheetDataStart, sheetDataEnd);
  const headerRowStart = sheetData.indexOf('<row');
  const headerRowEnd = sheetData.indexOf('</row>') + '</row>'.length;
  const headerRow = sheetData.slice(headerRowStart, headerRowEnd);

  const lastColumnName = getColumnName(Math.max(columnCount - 1, 0));

  // The template's own header stops one column short of ours: leadId is appended
  // so the debtor numbers can be matched back on re-import.
  const headerWithLeadId = headerRow
    .replace(/spans="1:\d+"/, `spans="1:${columnCount}"`)
    .replace(
      '</row>',
      `<c r="${lastColumnName}1" s="1" t="inlineStr"><is><t>leadId</t></is></c></row>`,
    );

  const bodyRows = rows
    .map((values, rowIndex) => {
      const rowNumber = rowIndex + 2;

      const cells = values
        .map((value, columnIndex) => {
          const cellValue = stripInvalidXmlChars(value);

          // Empty cells are omitted entirely: a sparse row is valid OOXML and
          // keeps the file small, since most of the 54 columns stay blank.
          if (cellValue === '') {
            return '';
          }

          const reference = `${getColumnName(columnIndex)}${rowNumber}`;

          return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cellValue)}</t></is></c>`;
        })
        .join('');

      return `<row r="${rowNumber}" spans="1:${columnCount}">${cells}</row>`;
    })
    .join('');

  const filledSheet =
    sheet.slice(0, sheetDataStart) +
    `<sheetData>${headerWithLeadId}${bodyRows}</sheetData>` +
    sheet.slice(sheetDataEnd);

  archive[SHEET_PATH] = strToU8(
    filledSheet.replace(
      /<dimension ref="[^"]*"\/>/,
      `<dimension ref="A1:${lastColumnName}${rows.length + 1}"/>`,
    ),
  );

  const zipped = zipSync(archive);

  // fflate types its result as Uint8Array<ArrayBufferLike>, which Blob will not
  // accept. Copying into a plainly-backed array is cheaper than a cast is
  // honest, at this size.
  const workbook = new Uint8Array(zipped.length);
  workbook.set(zipped);

  return workbook;
};
