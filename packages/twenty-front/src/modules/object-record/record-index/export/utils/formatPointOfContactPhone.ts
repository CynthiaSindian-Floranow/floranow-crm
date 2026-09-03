import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

// The marketplace importer reads this column programmatically, so it gets a
// strictly "+digits" phone or nothing at all. Anything that cannot be normalised
// to that shape is exported blank rather than passed through in a shape the
// importer would misread.
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
