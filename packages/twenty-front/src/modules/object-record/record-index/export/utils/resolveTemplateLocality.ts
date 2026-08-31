import { type LocalityDataset } from '@/localities/types/LocalityDataset';
import { LEAD_REGISTRATION_CITY_ALIASES } from '@/object-record/record-index/export/constants/LeadRegistrationCityAliases';
import { LEAD_REGISTRATION_COUNTRY_ALIASES } from '@/object-record/record-index/export/constants/LeadRegistrationCountryAliases';
import { LEAD_REGISTRATION_TEMPLATE_COUNTRIES } from '@/object-record/record-index/export/constants/LeadRegistrationTemplateCountries';
import {
  normalizeTemplateText,
  templateTextKey,
} from '@/object-record/record-index/export/utils/normalizeTemplateText';

export type TemplateLocality = {
  country: string;
  city: string;
};

const EMPTY: TemplateLocality = { country: '', city: '' };

const resolveCountry = (rawCountry: string) => {
  const key = templateTextKey(rawCountry);

  if (key === '') {
    return undefined;
  }

  const aliased = LEAD_REGISTRATION_COUNTRY_ALIASES[key];

  if (aliased !== undefined) {
    return aliased;
  }

  return LEAD_REGISTRATION_TEMPLATE_COUNTRIES.find(
    (country) => templateTextKey(country) === key,
  );
};

// Turns a lead's stored country and city into the exact spellings the template's
// dropdowns accept, or blanks them. City is only meaningful once the country is
// known, because the template validates City against a per-country list.
export const resolveTemplateLocality = (
  dataset: LocalityDataset,
  rawCountry: string,
  rawCity: string,
): TemplateLocality => {
  const country = resolveCountry(rawCountry);

  if (country === undefined) {
    return EMPTY;
  }

  const cityKey = templateTextKey(rawCity);

  if (cityKey === '') {
    return { country, city: '' };
  }

  const aliased = LEAD_REGISTRATION_CITY_ALIASES[`${country}|${cityKey}`];

  if (aliased !== undefined) {
    return { country, city: aliased };
  }

  const datasetCountry = Object.values(dataset).find(
    (entry) => entry.n === country,
  );

  const match = datasetCountry?.c.find(
    ([cityName]) => templateTextKey(cityName) === cityKey,
  );

  return {
    country,
    // The template spells cities without accents, and normalising the source
    // spelling reproduces its exact form.
    city: match === undefined ? '' : normalizeTemplateText(match[0]),
  };
};
