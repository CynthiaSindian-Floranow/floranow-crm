import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { useFindManyRecordsQuery } from '@/object-record/hooks/useFindManyRecordsQuery';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import {
  type LeadRegistrationImportOutcome,
  type LeadRegistrationImportRow,
} from '@/object-record/record-index/import/types/LeadRegistrationImportRow';
import { planLeadRegistrationImport } from '@/object-record/record-index/import/utils/planLeadRegistrationImport';
import { useBuildSpreadsheetImportFields } from '@/object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useOpenSpreadsheetImportDialog } from '@/spreadsheet-import/hooks/useOpenSpreadsheetImportDialog';
import {
  type ImportedStructuredRow,
  type SpreadsheetImportTableHook,
} from '@/spreadsheet-import/types';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { t } from '@lingui/core/macro';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

const LEAD_ID_FIELD_KEY = 'id';
const DEBTOR_NUMBER_FIELD_KEY = 'debtorNumber';

const readCell = (row: ImportedStructuredRow, key: string): string => {
  const value = row[key];

  return typeof value === 'string' ? value : '';
};

export const useOpenLeadRegistrationImportDialog = () => {
  const { openSpreadsheetImportDialog } = useOpenSpreadsheetImportDialog();
  const { buildSpreadsheetImportFields } = useBuildSpreadsheetImportFields();
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const apolloCoreClient = useApolloCoreClient();

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: CoreObjectNameSingular.Opportunity,
  });

  const { updateOneRecord } = useUpdateOneRecord();

  const { findManyRecordsQuery } = useFindManyRecordsQuery({
    objectNameSingular: CoreObjectNameSingular.Opportunity,
    recordGqlFields: { id: true, name: true, debtorNumber: true },
  });

  // Only the two columns the round trip needs. Everything else in the sheet is
  // ignored on purpose, so an operator's edits to name or city cannot leak back.
  const fieldsToImport = [LEAD_ID_FIELD_KEY, DEBTOR_NUMBER_FIELD_KEY]
    .map((fieldName) =>
      objectMetadataItem.fields.find((field) => field.name === fieldName),
    )
    .filter(isDefined) as FieldMetadataItem[];

  const fetchLeadsByIds = async (
    leadIds: string[],
  ): Promise<Map<string, ObjectRecord>> => {
    if (leadIds.length === 0) {
      return new Map();
    }

    const result = await apolloCoreClient.query({
      query: findManyRecordsQuery,
      variables: { filter: { id: { in: leadIds } }, limit: leadIds.length },
      fetchPolicy: 'network-only',
    });

    const data = result.data as
      | Record<string, { edges?: { node: ObjectRecord }[] }>
      | undefined;

    const edges = data?.[objectMetadataItem.namePlural]?.edges ?? [];

    return new Map(edges.map((edge) => [edge.node.id, edge.node]));
  };

  const toImportRows = (
    rows: ImportedStructuredRow[],
  ): LeadRegistrationImportRow[] =>
    rows.map((row) => ({
      leadId: readCell(row, LEAD_ID_FIELD_KEY),
      debtorNumber: readCell(row, DEBTOR_NUMBER_FIELD_KEY),
    }));

  const openLeadRegistrationImportDialog = () => {
    // The wizard auto-maps a spreadsheet header to a field by comparing the
    // header text to the field label. Labelling these two after the exported
    // headers ("Id" would never match "leadId") means the operator does not
    // have to map anything by hand -- and an unmapped id column silently makes
    // every row look unmatched.
    const spreadsheetImportFields = buildSpreadsheetImportFields(
      fieldsToImport,
    ).map((field) => ({
      ...field,
      label: field.key === LEAD_ID_FIELD_KEY ? 'leadId' : field.label,
    }));

    // Populated by matchColumnsStepHook (async) so the table hook (sync) can
    // flag unmatched and conflicting rows before the operator submits.
    let leadsById = new Map<string, ObjectRecord>();

    const tableHook: SpreadsheetImportTableHook = (table, addError) => {
      const plan = planLeadRegistrationImport({
        rows: toImportRows(table),
        existingLeadsById: leadsById,
      });

      for (const rowResult of plan.rowResults) {
        if (rowResult.outcome === 'skippedLeadNotFound') {
          addError(rowResult.rowIndex, LEAD_ID_FIELD_KEY, {
            message: t`No lead with this id — this row will be skipped.`,
            level: 'error',
          });
        }

        if (rowResult.outcome === 'conflict') {
          const existingDebtorNumber = rowResult.existingDebtorNumber ?? '';

          addError(rowResult.rowIndex, DEBTOR_NUMBER_FIELD_KEY, {
            message: t`This lead already has debtor number ${existingDebtorNumber}. It will not be overwritten.`,
            level: 'error',
          });
        }

        if (
          rowResult.outcome !== 'skippedNoDebtorNumber' &&
          plan.duplicatedDebtorNumbers.includes(rowResult.debtorNumber)
        ) {
          addError(rowResult.rowIndex, DEBTOR_NUMBER_FIELD_KEY, {
            message: t`This debtor number appears on more than one row.`,
            level: 'warning',
          });
        }
      }

      return table;
    };

    openSpreadsheetImportDialog({
      spreadsheetImportFields,
      availableFieldMetadataItems: fieldsToImport,
      matchColumnsStepHook: async (importedStructuredRows) => {
        const leadIds = toImportRows(importedStructuredRows)
          .map((row) => row.leadId.trim())
          .filter((leadId) => leadId !== '');

        leadsById = await fetchLeadsByIds([...new Set(leadIds)]);

        return importedStructuredRows;
      },
      tableHook,
      onSubmit: async (validationResult) => {
        const plan = planLeadRegistrationImport({
          rows: toImportRows(validationResult.allStructuredRows),
          existingLeadsById: leadsById,
        });

        try {
          for (const rowToUpdate of plan.rowsToUpdate) {
            await updateOneRecord({
              objectNameSingular: CoreObjectNameSingular.Opportunity,
              idToUpdate: rowToUpdate.leadId,
              updateOneRecordInput: {
                debtorNumber: rowToUpdate.debtorNumber,
              },
            });
          }

          const countOf = (outcome: LeadRegistrationImportOutcome) =>
            plan.rowResults.filter((rowResult) => rowResult.outcome === outcome)
              .length;

          const updatedCount = plan.rowsToUpdate.length;

          // Spelled out per reason: "skipped" on its own gives the operator no
          // way to tell "not registered yet" from "nothing matched this file".
          const reasons = [
            [countOf('skippedNoDebtorNumber'), t`no debtor number yet`],
            [countOf('skippedLeadNotFound'), t`lead not found`],
            [countOf('skippedMissingLeadId'), t`no lead id`],
            [countOf('unchanged'), t`already up to date`],
            [countOf('conflict'), t`kept existing number`],
          ] as const;

          const skippedSummary = reasons
            .filter(([count]) => count > 0)
            .map(([count, reason]) => `${count} ${reason}`)
            .join(', ');

          enqueueSuccessSnackBar({
            message: skippedSummary
              ? t`${updatedCount} lead(s) updated — ${skippedSummary}.`
              : t`${updatedCount} lead(s) updated.`,
          });
        } catch (error) {
          enqueueErrorSnackBar({ apolloError: error as never });
        }
      },
    });
  };

  return { openLeadRegistrationImportDialog };
};
