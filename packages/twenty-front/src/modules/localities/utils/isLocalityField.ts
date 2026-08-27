import { LOCALITY_FIELD_KIND_BY_OBJECT } from '@/localities/constants/LocalityFieldNames';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { isFieldText } from '@/object-record/record-field/ui/types/guards/isFieldText';
import { isDefined } from 'twenty-shared/utils';

// True for the text fields that are edited through the cascading locality
// picker. Deliberately narrow: it only ever matches the objects and field names
// listed in LOCALITY_FIELD_KIND_BY_OBJECT, so every other text field keeps the
// standard input.
export const isLocalityField = (
  fieldDefinition: FieldDefinition<FieldMetadata>,
) => {
  if (!isFieldText(fieldDefinition)) {
    return false;
  }

  const objectNameSingular =
    fieldDefinition.metadata.objectMetadataNameSingular;

  if (!isDefined(objectNameSingular)) {
    return false;
  }

  return isDefined(
    LOCALITY_FIELD_KIND_BY_OBJECT[objectNameSingular]?.[
      fieldDefinition.metadata.fieldName
    ],
  );
};
