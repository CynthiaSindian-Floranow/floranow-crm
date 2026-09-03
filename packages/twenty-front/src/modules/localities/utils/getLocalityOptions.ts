import { type LocalitySelection } from '@/localities/utils/resolveLocalitySelection';
import {
  type LocalityDataset,
  type LocalityFieldKind,
  type LocalityValues,
} from '@/localities/types/LocalityDataset';

// One row of a locality dropdown. `values` is what gets written to the record
// when it is picked — a city writes its state and country too, so the three
// fields can never disagree.
export type LocalityOption = {
  label: string;
  // Disambiguates same-named places, e.g. "Springfield · Illinois".
  context: string | undefined;
  values: LocalityValues;
};

const buildCountryOptions = (dataset: LocalityDataset): LocalityOption[] =>
  Object.values(dataset).map((country) => ({
    label: country.n,
    context: undefined,
    // Picking a country invalidates whatever state and city were there.
    values: { country: country.n, state: '', city: '' },
  }));

const buildStateOptions = (
  dataset: LocalityDataset,
  selection: LocalitySelection,
): LocalityOption[] => {
  const countryCodes =
    selection.countryCode !== undefined
      ? [selection.countryCode]
      : Object.keys(dataset);

  return countryCodes.flatMap((countryCode) => {
    const country = dataset[countryCode];

    return country.s.map(([, stateName]) => ({
      label: stateName,
      // Without a chosen country the list spans the world, so say where each
      // state is.
      context: selection.countryCode === undefined ? country.n : undefined,
      values: { country: country.n, state: stateName, city: '' },
    }));
  });
};

const buildCityOptions = (
  dataset: LocalityDataset,
  selection: LocalitySelection,
): LocalityOption[] => {
  const countryCodes =
    selection.countryCode !== undefined
      ? [selection.countryCode]
      : Object.keys(dataset);

  return countryCodes.flatMap((countryCode) => {
    const country = dataset[countryCode];

    const isInSelectedState = ([, stateIndex]: [string, number]) =>
      selection.stateIndex === undefined || stateIndex === selection.stateIndex;

    return country.c.filter(isInSelectedState).map(([cityName, stateIndex]) => {
      const stateName = stateIndex === -1 ? '' : country.s[stateIndex][1];

      const context = [
        selection.stateIndex === undefined ? stateName : '',
        selection.countryCode === undefined ? country.n : '',
      ]
        .filter((part) => part !== '')
        .join(' · ');

      return {
        label: cityName,
        context: context === '' ? undefined : context,
        values: { country: country.n, state: stateName, city: cityName },
      };
    });
  });
};

export const getLocalityOptions = (
  dataset: LocalityDataset,
  kind: LocalityFieldKind,
  selection: LocalitySelection,
): LocalityOption[] => {
  switch (kind) {
    case 'country':
      return buildCountryOptions(dataset);
    case 'state':
      return buildStateOptions(dataset, selection);
    case 'city':
      return buildCityOptions(dataset, selection);
  }
};
