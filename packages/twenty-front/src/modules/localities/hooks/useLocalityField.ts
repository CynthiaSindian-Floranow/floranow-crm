import { LOCALITY_FIELD_KIND_BY_OBJECT } from '@/localities/constants/LocalityFieldNames';
import {
  type LocalityFieldKind,
  type LocalityValues,
} from '@/localities/types/LocalityDataset';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { recordStoreFamilySelector } from '@/object-record/record-store/states/selectors/recordStoreFamilySelector';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useContext, useMemo } from 'react';
import { isDefined } from 'twenty-shared/utils';

const KINDS: LocalityFieldKind[] = ['country', 'state', 'city'];

const asText = (value: unknown) => (typeof value === 'string' ? value : '');

// Resolves the country / state / city trio around the field currently being
// edited, and writes all three back together.
export const useLocalityField = () => {
  const { recordId, fieldDefinition } = useContext(FieldContext);
  const { updateOneRecord } = useUpdateOneRecord();

  const objectNameSingular =
    fieldDefinition.metadata.objectMetadataNameSingular ?? '';
  const fieldName = fieldDefinition.metadata.fieldName;

  const kindByFieldName = LOCALITY_FIELD_KIND_BY_OBJECT[objectNameSingular];
  const kind = kindByFieldName?.[fieldName];

  // Reverse the map so a kind can find the field name holding it. Falls back to
  // the kind itself, which is only ever used when this object is not mapped —
  // in which case `kind` is undefined and nothing below runs.
  const fieldNameByKind = Object.fromEntries(
    KINDS.map((kindToResolve) => [
      kindToResolve,
      Object.entries(kindByFieldName ?? {}).find(
        ([, mappedKind]) => mappedKind === kindToResolve,
      )?.[0] ?? kindToResolve,
    ]),
  ) as Record<LocalityFieldKind, string>;

  const country = useAtomFamilySelectorValue(recordStoreFamilySelector, {
    recordId,
    fieldName: fieldNameByKind.country,
  });
  const state = useAtomFamilySelectorValue(recordStoreFamilySelector, {
    recordId,
    fieldName: fieldNameByKind.state,
  });
  const city = useAtomFamilySelectorValue(recordStoreFamilySelector, {
    recordId,
    fieldName: fieldNameByKind.city,
  });

  // Memoised on the three strings: the city option list is 24k entries long and
  // is rebuilt whenever this object's identity changes.
  const values: LocalityValues = useMemo(
    () => ({
      country: asText(country),
      state: asText(state),
      city: asText(city),
    }),
    [country, state, city],
  );

  // One mutation for the whole trio: picking a city sets its state and country
  // in the same write, so the record is never briefly inconsistent.
  const persistLocality = async (newValues: LocalityValues) => {
    if (!isDefined(kind)) {
      return;
    }

    await updateOneRecord({
      objectNameSingular,
      idToUpdate: recordId,
      updateOneRecordInput: {
        [fieldNameByKind.country]: newValues.country,
        [fieldNameByKind.state]: newValues.state,
        [fieldNameByKind.city]: newValues.city,
      },
    });
  };

  return { kind, values, persistLocality };
};
