import { loadLocalityDataset } from '@/localities/hooks/useLocalityDataset';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useLazyFetchAllRecords } from '@/object-record/hooks/useLazyFetchAllRecords';
import { EXPORT_TABLE_DATA_DEFAULT_PAGE_SIZE } from '@/object-record/object-options-dropdown/constants/ExportTableDataDefaultPageSize';
import { LEAD_REGISTRATION_EXPORT_FILTER } from '@/object-record/record-index/export/constants/LeadRegistrationExportFilter';
import { LEAD_REGISTRATION_EXPORT_TEMPLATE } from '@/object-record/record-index/export/constants/LeadRegistrationExportTemplate';
import { buildLeadRegistrationRows } from '@/object-record/record-index/export/utils/buildLeadRegistrationRows';
import { buildLeadRegistrationWorkbook } from '@/object-record/record-index/export/utils/buildLeadRegistrationWorkbook';
import { saveAs } from 'file-saver';
import { useCallback } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';

const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const useExportLeadsForRegistration = () => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: CoreObjectNameSingular.Opportunity,
  });

  const { progress, isDownloading, fetchAllRecords } = useLazyFetchAllRecords({
    objectNameSingular: CoreObjectNameSingular.Opportunity,
    // Deliberately ignores the current view's filters: this export always means
    // "every lead awaiting registration", regardless of what the user is looking at.
    filter: LEAD_REGISTRATION_EXPORT_FILTER,
    recordGqlFields: LEAD_REGISTRATION_EXPORT_TEMPLATE.recordGqlFields,
    limit: EXPORT_TABLE_DATA_DEFAULT_PAGE_SIZE,
    delayMs: 100,
  });

  const download = useCallback(async () => {
    const records = await fetchAllRecords();

    // The marketplace's Segment column wants the option's label, not the value
    // the record stores. Reading it from field metadata means renaming an option
    // in the data model does not need a matching code change.
    const buyerSegmentLabelByValue = Object.fromEntries(
      (
        objectMetadataItem.fields.find((field) => field.name === 'buyerSegment')
          ?.options ?? []
      ).map((option) => [option.value, option.label]),
    );

    const dataset = await loadLocalityDataset();

    const rows = buildLeadRegistrationRows({
      records,
      dataset,
      buyerSegmentLabelByValue,
    });

    const workbook = buildLeadRegistrationWorkbook({
      rows,
      columnCount: LEAD_REGISTRATION_EXPORT_TEMPLATE.columns.length,
    });

    saveAs(
      new Blob([workbook], { type: XLSX_MIME_TYPE }),
      LEAD_REGISTRATION_EXPORT_TEMPLATE.filename,
    );
  }, [fetchAllRecords, objectMetadataItem]);

  return { download, progress, isDownloading };
};
