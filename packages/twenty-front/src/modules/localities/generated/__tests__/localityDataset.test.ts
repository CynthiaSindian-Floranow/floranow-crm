import generatedDataset from '@/localities/generated/localityDataset.json';
import { type LocalityDataset } from '@/localities/types/LocalityDataset';
import { getLocalityOptions } from '@/localities/utils/getLocalityOptions';
import { resolveLocalitySelection } from '@/localities/utils/resolveLocalitySelection';

// Guards the file scripts/generate-locality-dataset.ts produces, so a bad
// regeneration is caught here rather than in a dropdown.
const dataset = generatedDataset as unknown as LocalityDataset;

describe('the generated locality dataset', () => {
  it('should cover every country in the source data', () => {
    expect(Object.keys(dataset)).toHaveLength(209);
  });

  it('should hold every city, each pointing at a real state or none', () => {
    const cityCount = Object.values(dataset).reduce(
      (total, country) => total + country.c.length,
      0,
    );

    expect(cityCount).toBe(24324);

    for (const country of Object.values(dataset)) {
      for (const [, stateIndex] of country.c) {
        expect(stateIndex === -1 || country.s[stateIndex] !== undefined).toBe(
          true,
        );
      }
    }
  });

  it('should use the everyday spelling for the Gulf, not the ISO romanisation', () => {
    const stateNames = (countryCode: string) =>
      dataset[countryCode].s.map(([, name]) => name);

    expect(stateNames('AE')).toContain('Dubai');
    expect(stateNames('AE')).not.toContain('Dubayy');
    expect(stateNames('SA')).toContain('Riyadh');
    expect(stateNames('SA')).not.toContain('Ar Riyāḑ');
  });

  it('should back-fill Dubai and the UAE when Dubai is picked', () => {
    const options = getLocalityOptions(dataset, 'city', {
      countryCode: 'AE',
      stateIndex: undefined,
    });

    expect(
      options.find((option) => option.label === 'Dubai')?.values,
    ).toEqual({
      country: 'United Arab Emirates',
      state: 'Dubai',
      city: 'Dubai',
    });
  });

  it('should narrow to one country once that country is on the record', () => {
    const selection = resolveLocalitySelection(dataset, {
      country: 'Saudi Arabia',
      state: '',
      city: '',
    });

    expect(selection.countryCode).toBe('SA');
    expect(getLocalityOptions(dataset, 'city', selection)).toHaveLength(
      dataset.SA.c.length,
    );
  });
});
