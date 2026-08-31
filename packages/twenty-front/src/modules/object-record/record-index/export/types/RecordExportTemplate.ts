import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type RecordGqlOperationGqlRecordFields } from 'twenty-shared/types';

export type RecordExportTemplateColumn = {
  header: string;
  // Placeholder columns omit getValue: they are exported empty on purpose so the
  // target system's importer still sees the column and a human fills it in.
  getValue?: (record: ObjectRecord) => string | null | undefined;
};

export type RecordExportTemplate = {
  filename: string;
  columns: RecordExportTemplateColumn[];
  // Only what the columns actually read, so the export query stays independent
  // of which fields happen to be visible in the current view.
  recordGqlFields: RecordGqlOperationGqlRecordFields;
};
