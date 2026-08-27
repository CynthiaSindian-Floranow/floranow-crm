import { type LocalityDataset } from '@/localities/types/LocalityDataset';
import { useEffect, useState } from 'react';

// ~460KB of JSON. Kept out of the main bundle by the dynamic import below, and
// fetched the first time someone opens a country / state / city dropdown.
let loadedDataset: LocalityDataset | undefined;
let datasetPromise: Promise<LocalityDataset> | undefined;

const loadLocalityDataset = () => {
  datasetPromise ??= import('@/localities/generated/localityDataset.json').then(
    (module) => {
      // TypeScript widens the JSON tuples to arrays; the generator is what
      // guarantees the shape.
      loadedDataset = module.default as unknown as LocalityDataset;

      return loadedDataset;
    },
  );

  return datasetPromise;
};

export const useLocalityDataset = () => {
  const [dataset, setDataset] = useState(loadedDataset);

  useEffect(() => {
    if (dataset !== undefined) {
      return;
    }

    let isStillMounted = true;

    loadLocalityDataset().then((loaded) => {
      if (isStillMounted) {
        setDataset(loaded);
      }
    });

    return () => {
      isStillMounted = false;
    };
  }, [dataset]);

  return dataset;
};
