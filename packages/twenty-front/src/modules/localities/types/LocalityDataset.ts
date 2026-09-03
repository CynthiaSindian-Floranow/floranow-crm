// Shape of src/modules/localities/generated/localityDataset.json, written by
// scripts/generate-locality-dataset.ts. The keys are one letter because the
// whole file is shipped to the browser — see the generator for the rationale.
export type LocalityCountry = {
  // Country name in English, e.g. "United Arab Emirates"
  n: string;
  // Subdivisions as [ISO 3166-2 code, display name], sorted by name
  s: [code: string, name: string][];
  // Cities as [name, index into `s`], sorted by name. -1 means the source data
  // has no subdivision for that city.
  c: [name: string, stateIndex: number][];
};

// Keyed by ISO 3166-1 alpha-2 country code, ordered by country name.
export type LocalityDataset = Record<string, LocalityCountry>;

export type LocalityFieldKind = 'country' | 'state' | 'city';

// What the three Lead fields hold. Values are the display names, not codes:
// they are exported verbatim into the marketplace's customers-template.csv.
export type LocalityValues = {
  country: string;
  state: string;
  city: string;
};
