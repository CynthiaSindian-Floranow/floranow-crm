import { useLazyFetchAllRecords } from '@/object-record/hooks/useLazyFetchAllRecords';
import { EXPORT_TABLE_DATA_DEFAULT_PAGE_SIZE } from '@/object-record/object-options-dropdown/constants/ExportTableDataDefaultPageSize';
import { LEAD_REGISTRATION_EXPORT_FILTER } from '@/object-record/record-index/export/constants/LeadRegistrationExportFilter';
import { LEAD_REGISTRATION_EXPORT_TEMPLATE } from '@/object-record/record-index/export/constants/LeadRegistrationExportTemplate';
import { generateCsvFromTemplate } from '@/object-record/record-index/export/utils/generateCsvFromTemplate';
import { saveAs } from 'file-saver';
import { useCallback } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';

export const useExportLeadsForRegistration = () => {
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

    const csv = generateCsvFromTemplate({
      template: LEAD_REGISTRATION_EXPORT_TEMPLATE,
      records,
    });

    saveAs(
      new Blob([csv], { type: 'text/csv' }),
      LEAD_REGISTRATION_EXPORT_TEMPLATE.filename,
    );
  }, [fetchAllRecords]);

  return { download, progress, isDownloading };
};
