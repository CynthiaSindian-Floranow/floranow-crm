import { type LocalityDataset } from '@/localities/types/LocalityDataset';
import { getLocalityOptions } from '@/localities/utils/getLocalityOptions';
import { resolveLocalitySelection } from '@/localities/utils/resolveLocalitySelection';

const DATASET: LocalityDataset = {
  AE: {
    n: 'United Arab Emirates',
    s: [
      ['AE-AZ', 'Abu Dhabi'],
      ['AE-DU', 'Dubai'],
    ],
    c: [
      ['Abu Dhabi', 0],
      ['Al Ain City', 0],
      ['Dubai', 1],
      ['Nomad Town', -1],
    ],
  },
  SA: {
    n: 'Saudi Arabia',
    s: [['SA-01', 'Riyadh']],
    c: [['Riyadh', 0]],
  },
};

const EMPTY = { country: '', state: '', city: '' };

describe('resolveLocalitySelection', () => {
  it('should resolve a country and state when both match the dataset', () => {
    expect(
      resolveLocalitySelection(DATASET, {
        country: 'United Arab Emirates',
        state: 'Dubai',
        city: 'Dubai',
      }),
    ).toEqual({ countryCode: 'AE', stateIndex: 1 });
  });

  it('should match case-insensitively', () => {
    expect(
      resolveLocalitySelection(DATASET, {
        ...EMPTY,
        country: 'saudi arabia',
      }).countryCode,
    ).toBe('SA');
  });

  it('should resolve nothing when the value predates the picker', () => {
    expect(
      resolveLocalitySelection(DATASET, {
        country: 'ksa',
        state: 'riyadh',
        city: 'riyadh',
      }),
    ).toEqual({ countryCode: undefined, stateIndex: undefined });
  });

  it('should resolve no state when the state does not belong to the country', () => {
    expect(
      resolveLocalitySelection(DATASET, {
        ...EMPTY,
        country: 'United Arab Emirates',
        state: 'Riyadh',
      }),
    ).toEqual({ countryCode: 'AE', stateIndex: undefined });
  });
});

describe('getLocalityOptions', () => {
  const selectionFor = (values: Partial<typeof EMPTY>) =>
    resolveLocalitySelection(DATASET, { ...EMPTY, ...values });

  it('should offer every country, and clear state and city when one is picked', () => {
    const options = getLocalityOptions(DATASET, 'country', selectionFor({}));

    expect(options.map((option) => option.label)).toEqual([
      'United Arab Emirates',
      'Saudi Arabia',
    ]);
    expect(options[0].values).toEqual({
      country: 'United Arab Emirates',
      state: '',
      city: '',
    });
  });

  it('should limit states to the chosen country', () => {
    const options = getLocalityOptions(
      DATASET,
      'state',
      selectionFor({ country: 'United Arab Emirates' }),
    );

    expect(options.map((option) => option.label)).toEqual([
      'Abu Dhabi',
      'Dubai',
    ]);
    expect(options[1].values).toEqual({
      country: 'United Arab Emirates',
      state: 'Dubai',
      city: '',
    });
  });

  it('should span every country and say where each state is when no country is chosen', () => {
    const options = getLocalityOptions(DATASET, 'state', selectionFor({}));

    expect(options).toHaveLength(3);
    expect(options[0].context).toBe('United Arab Emirates');
  });

  it('should limit cities to the chosen state', () => {
    const options = getLocalityOptions(
      DATASET,
      'city',
      selectionFor({ country: 'United Arab Emirates', state: 'Dubai' }),
    );

    expect(options.map((option) => option.label)).toEqual(['Dubai']);
  });

  it('should back-fill the country and state when a city is picked', () => {
    const options = getLocalityOptions(DATASET, 'city', selectionFor({}));
    const alAin = options.find((option) => option.label === 'Al Ain City');

    expect(alAin?.values).toEqual({
      country: 'United Arab Emirates',
      state: 'Abu Dhabi',
      city: 'Al Ain City',
    });
    expect(alAin?.context).toBe('Abu Dhabi · United Arab Emirates');
  });

  it('should keep cities that have no state in the source data', () => {
    const options = getLocalityOptions(
      DATASET,
      'city',
      selectionFor({ country: 'United Arab Emirates' }),
    );
    const nomadTown = options.find((option) => option.label === 'Nomad Town');

    expect(nomadTown?.values).toEqual({
      country: 'United Arab Emirates',
      state: '',
      city: 'Nomad Town',
    });
  });

  it('should not offer a city from another country once a country is chosen', () => {
    const options = getLocalityOptions(
      DATASET,
      'city',
      selectionFor({ country: 'Saudi Arabia' }),
    );

    expect(options.map((option) => option.label)).toEqual(['Riyadh']);
  });
});
