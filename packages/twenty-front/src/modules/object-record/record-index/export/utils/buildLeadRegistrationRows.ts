import { type LocalityDataset } from '@/localities/types/LocalityDataset';
import { LEAD_REGISTRATION_EXPORT_TEMPLATE } from '@/object-record/record-index/export/constants/LeadRegistrationExportTemplate';
import { LEAD_REGISTRATION_RESOLVED_COLUMNS } from '@/object-record/record-index/export/constants/LeadRegistrationResolvedColumns';
import { LEAD_REGISTRATION_USER_CATEGORY_BY_VALUE } from '@/object-record/record-index/export/constants/LeadRegistrationUserCategories';
import { resolveTemplateLocality } from '@/object-record/record-index/export/utils/resolveTemplateLocality';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { isDefined } from 'twenty-shared/utils';

type BuildLeadRegistrationRowsOptions = {
  records: ObjectRecord[];
  dataset: LocalityDataset;
  // Buyer Segment stored value -> its option label, read from field metadata so
  // renaming an option in the data model does not need a code change here.
  buyerSegmentLabelByValue: Record<string, string>;
};

const columnIndex = (header: string) => {
  const index = LEAD_REGISTRATION_EXPORT_TEMPLATE.columns.findIndex(
    (column) => column.header === header,
  );

  if (index === -1) {
    throw new Error(`Unknown lead registration column "${header}".`);
  }

  return index;
};

const asText = (value: unknown) =>
  typeof value === 'string' ? value : isDefined(value) ? String(value) : '';

// One string[] per lead, in template column order, ready for the workbook
// writer. Values the marketplace would reject are left empty rather than sent
// through: an empty cell is obvious to whoever completes the file, a wrong one
// is not.
export const buildLeadRegistrationRows = ({
  records,
  dataset,
  buyerSegmentLabelByValue,
}: BuildLeadRegistrationRowsOptions): string[][] => {
  const segmentIndex = columnIndex(LEAD_REGISTRATION_RESOLVED_COLUMNS.segment);
  const countryIndex = columnIndex(LEAD_REGISTRATION_RESOLVED_COLUMNS.country);
  const cityIndex = columnIndex(LEAD_REGISTRATION_RESOLVED_COLUMNS.city);
  const userCategoryIndex = columnIndex(
    LEAD_REGISTRATION_RESOLVED_COLUMNS.userCategory,
  );

  return records.map((record) => {
    const row = LEAD_REGISTRATION_EXPORT_TEMPLATE.columns.map((column) =>
      asText(column.getValue?.(record)),
    );

    const locality = resolveTemplateLocality(
      dataset,
      asText(record.country),
      asText(record.city),
    );

    row[countryIndex] = locality.country;
    row[cityIndex] = locality.city;

    row[segmentIndex] =
      buyerSegmentLabelByValue[asText(record.buyerSegment)] ?? '';

    row[userCategoryIndex] =
      LEAD_REGISTRATION_USER_CATEGORY_BY_VALUE[
        asText(record.customerCategory)
      ] ?? '';

    return row;
  });
};
