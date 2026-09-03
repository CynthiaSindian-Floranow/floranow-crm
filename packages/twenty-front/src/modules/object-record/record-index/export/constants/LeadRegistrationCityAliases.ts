// Legacy city spellings found in the CRM that the marketplace template writes
// differently. Keyed by "<template country>|<lower-cased, accent-stripped city>"
// so a spelling can never leak across borders.
//
// These are the values actually present in the data, not a general
// transliteration table: a city not listed here exports blank, which is the
// agreed behaviour. The country picker means new leads will not need entries.
export const LEAD_REGISTRATION_CITY_ALIASES: Record<string, string> = {
  // Different romanisations of the same place.
  'Saudi Arabia|jazan': 'Jizan',
  'Saudi Arabia|al jubail': 'Al Jubayl',
  'Saudi Arabia|jubail': 'Al Jubayl',
  // Al-Ahsa and Al-Hufuf are used interchangeably for the same city; the
  // template only carries the latter.
  'Saudi Arabia|al ahsa': 'Al Hufuf',
  // Typos and spacing variants of Khobar.
  'Saudi Arabia|khboar': 'Khobar',
  'Saudi Arabia|al kobar': 'Khobar',
  'Saudi Arabia|al khobar': 'Khobar',
  // The template qualifies several Emirati cities with "City".
  'United Arab Emirates|al ain': 'Al Ain City',
  'United Arab Emirates|ajman': 'Ajman City',
  'United Arab Emirates|ras al khaimah': 'Ras Al Khaimah City',
  'United Arab Emirates|umm al quwain': 'Umm Al Quwain City',
  'United Arab Emirates|al fujairah': 'Al Fujairah City',
  'United Arab Emirates|fujairah': 'Al Fujairah City',
};
