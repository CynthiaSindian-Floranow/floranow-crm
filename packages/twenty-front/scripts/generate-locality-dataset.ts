// Turns scripts/locality-data/cities.json into the compact dataset the Lead
// country / state / city pickers load at runtime.
//
//   npx nx run twenty-front:localities:generate
//
// The output is committed. Re-run it only when cities.json changes, and commit
// the diff alongside it.
import iso3166 from 'iso-3166-2';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUBDIVISION_NAME_OVERRIDES } from './locality-data/subdivisionNameOverrides';
import rawCities from './locality-data/cities.json';

type RawCity = {
  code: string;
  label: string;
  country: string;
  state?: string;
};

// Compact on purpose: this ships to the browser. `s` is the country's state
// list, `c` its cities, each pointing at a state by index (-1 = no state).
type GeneratedCountry = {
  n: string;
  s: [code: string, name: string][];
  c: [name: string, stateIndex: number][];
};

const __dirname = dirname(fileURLToPath(import.meta.url));

const OUTPUT_PATH = resolve(
  __dirname,
  '../src/modules/localities/generated/localityDataset.json',
);

const countryDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' });

const resolveSubdivisionName = (stateCode: string) => {
  const override = SUBDIVISION_NAME_OVERRIDES[stateCode];

  if (override !== undefined) {
    return override;
  }

  return iso3166.subdivision(stateCode)?.name ?? stateCode;
};

const cities = rawCities as RawCity[];

const dataset: Record<string, GeneratedCountry> = {};
const unresolvedStateCodes = new Set<string>();

for (const city of cities) {
  const countryCode = city.country;

  if (dataset[countryCode] === undefined) {
    dataset[countryCode] = {
      n: countryDisplayNames.of(countryCode) ?? countryCode,
      s: [],
      c: [],
    };
  }

  const country = dataset[countryCode];

  let stateIndex = -1;

  if (city.state !== undefined) {
    stateIndex = country.s.findIndex(([code]) => code === city.state);

    if (stateIndex === -1) {
      const stateName = resolveSubdivisionName(city.state);

      if (stateName === city.state) {
        unresolvedStateCodes.add(city.state);
      }

      stateIndex = country.s.push([city.state, stateName]) - 1;
    }
  }

  country.c.push([city.label, stateIndex]);
}

// Sort so the dropdowns need no work at runtime. Cities carry a state index, so
// reorder the state list first and remap, rather than sorting them in place.
for (const country of Object.values(dataset)) {
  const stateOrder = country.s
    .map((state, index) => ({ state, index }))
    .sort((a, b) => a.state[1].localeCompare(b.state[1]));

  const remappedIndexByOldIndex = new Map(
    stateOrder.map(({ index }, newIndex) => [index, newIndex]),
  );

  country.s = stateOrder.map(({ state }) => state);
  country.c = country.c
    .map(([name, oldIndex]): [string, number] => [
      name,
      oldIndex === -1 ? -1 : (remappedIndexByOldIndex.get(oldIndex) ?? -1),
    ])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

const sortedDataset = Object.fromEntries(
  Object.entries(dataset).sort(([, a], [, b]) => a.n.localeCompare(b.n)),
);

writeFileSync(OUTPUT_PATH, JSON.stringify(sortedDataset));

const countryCount = Object.keys(sortedDataset).length;
const stateCount = Object.values(sortedDataset).reduce(
  (total, country) => total + country.s.length,
  0,
);

// eslint-disable-next-line no-console
console.log(
  `Wrote ${countryCount} countries, ${stateCount} states, ${cities.length} cities to ${OUTPUT_PATH}`,
);

if (unresolvedStateCodes.size > 0) {
  // eslint-disable-next-line no-console
  console.warn(
    `${unresolvedStateCodes.size} state codes had no name and fall back to the raw code: ${[...unresolvedStateCodes].join(', ')}`,
  );
}
