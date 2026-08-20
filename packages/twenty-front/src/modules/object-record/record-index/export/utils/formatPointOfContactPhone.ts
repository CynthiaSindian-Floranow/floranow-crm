import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

// A phone starts with "+", which the CSV-injection guard would prefix with an
// invisible zero-width joiner -- harmless in Excel, but it corrupts the value for
// the marketplace's importer, which reads this column programmatically. Emitting a
// strictly numeric phone instead means there is nothing left to guard against, so
// the column can safely opt out of the guard. Anything that cannot be normalised to
// that shape is exported blank rather than smuggled through unsanitised.
const NORMALISED_PHONE_PATTERN = /^\+?[0-9]{4,20}$/;

export const formatPointOfContactPhone = (record: ObjectRecord): string => {
  const phones = record.pointOfContact?.phones;

  if (!isDefined(phones) || !isNonEmptyString(phones.primaryPhoneNumber)) {
    return '';
  }

  const callingCode = phones.primaryPhoneCallingCode ?? '';
  const phoneNumber = `${callingCode}${phones.primaryPhoneNumber}`.replace(
    /[\s()-]/g,
    '',
  );

  return NORMALISED_PHONE_PATTERN.test(phoneNumber) ? phoneNumber : '';
};
