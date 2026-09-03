// Leads created before the country picker existed hold free text — prod has
// "ksa", "KSA" and "UAE". These are the spellings actually seen in the data,
// mapped onto the template's vocabulary. Keys are compared after lower-casing
// and stripping accents, so only one form of each needs listing.
//
// Anything not listed here and not already an exact country name exports blank.
// Guessing is worse than an empty cell the importer will not reject.
export const LEAD_REGISTRATION_COUNTRY_ALIASES: Record<string, string> = {
  ksa: 'Saudi Arabia',
  saudi: 'Saudi Arabia',
  'saudi arabia': 'Saudi Arabia',
  'kingdom of saudi arabia': 'Saudi Arabia',
  uae: 'United Arab Emirates',
  'u.a.e': 'United Arab Emirates',
  'u.a.e.': 'United Arab Emirates',
  emirates: 'United Arab Emirates',
  'united arab emirates': 'United Arab Emirates',
  iraq: 'Iraq',
  jordan: 'Jordan',
  kuwait: 'Kuwait',
  qatar: 'Qatar',
};
