import { type RecordExportTemplate } from '@/object-record/record-index/export/types/RecordExportTemplate';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { sanitizeValueForCSVExport } from '@/spreadsheet-import/utils/sanitizeValueForCSVExport';
import { json2csv } from 'json-2-csv';
import { isDefined } from 'twenty-shared/utils';

type GenerateCsvFromTemplateOptions = {
  template: RecordExportTemplate;
  records: ObjectRecord[];
};

export const generateCsvFromTemplate = ({
  template,
  records,
}: GenerateCsvFromTemplateOptions): string => {
  const rows = records.map((record) =>
    Object.fromEntries(
      template.columns.map((column) => {
        const value = column.getValue?.(record);

        if (!isDefined(value)) {
          return [column.header, ''];
        }

        return [
          column.header,
          column.isPreSanitized === true
            ? String(value)
            : sanitizeValueForCSVExport(String(value)),
        ];
      }),
    ),
  );

  return json2csv(rows, {
    keys: template.columns.map((column) => column.header),
    emptyFieldValue: '',
    // No BOM: this file is consumed by the marketplace importer rather than
    // opened in Excel, and a BOM would corrupt its first header.
    excelBOM: false,
    // CSV injection is handled by sanitizeValueForCSVExport above, which
    // preserves the original value where the csvSecurity option would not.
  });
};
