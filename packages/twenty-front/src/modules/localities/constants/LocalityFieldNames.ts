import { type LocalityFieldKind } from '@/localities/types/LocalityDataset';
import { CoreObjectNameSingular } from 'twenty-shared/types';

// Objects whose country / state / city text fields are edited through the
// cascading locality picker instead of a plain text box. Keyed by object, then
// by the field name on that object, so an object that spells them differently
// can join without touching the picker.
export const LOCALITY_FIELD_KIND_BY_OBJECT: Record<
  string,
  Record<string, LocalityFieldKind>
> = {
  // "Lead" in the UI — the standard opportunity object, relabelled.
  [CoreObjectNameSingular.Opportunity]: {
    country: 'country',
    state: 'state',
    city: 'city',
  },
};
