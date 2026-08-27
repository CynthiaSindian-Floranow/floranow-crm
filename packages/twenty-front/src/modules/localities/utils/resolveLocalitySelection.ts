import {
  type LocalityDataset,
  type LocalityValues,
} from '@/localities/types/LocalityDataset';
export type LocalitySelection = {
  countryCode: string | undefined;
  stateIndex: number | undefined;
};

const matches = (candidate: string, value: string) =>
  candidate.localeCompare(value, undefined, { sensitivity: 'base' }) === 0;

// Leads created before the picker existed hold free text — "ksa", "riyadh",
// "UAE". Anything that does not match the dataset simply resolves to undefined,
// which widens the dropdown rather than hiding the real options.
export const resolveLocalitySelection = (
  dataset: LocalityDataset,
  values: LocalityValues,
): LocalitySelection => {
  const countryCode =
    values.country === ''
      ? undefined
      : Object.keys(dataset).find((code) =>
          matches(dataset[code].n, values.country),
        );

  if (countryCode === undefined || values.state === '') {
    return { countryCode, stateIndex: undefined };
  }

  const stateIndex = dataset[countryCode].s.findIndex(([, name]) =>
    matches(name, values.state),
  );

  return {
    countryCode,
    stateIndex: stateIndex === -1 ? undefined : stateIndex,
  };
};
