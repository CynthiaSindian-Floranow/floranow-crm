// `iso-3166-2` returns the official romanised subdivision names, which for the
// Gulf read as "Abū Z̧aby" and "Ar Riyāḑ". Sales uses the everyday English
// spelling, and so does the marketplace importer these values are exported to.
// Only the GCC is overridden — those are the markets Floranow sells into, and a
// wrong guess elsewhere is worse than the official name.
export const SUBDIVISION_NAME_OVERRIDES: Record<string, string> = {
  // United Arab Emirates
  'AE-AZ': 'Abu Dhabi',
  'AE-DU': 'Dubai',
  'AE-SH': 'Sharjah',
  'AE-AJ': 'Ajman',
  'AE-UQ': 'Umm Al Quwain',
  'AE-RK': 'Ras Al Khaimah',
  'AE-FU': 'Fujairah',

  // Saudi Arabia
  'SA-01': 'Riyadh',
  'SA-02': 'Makkah',
  'SA-03': 'Madinah',
  'SA-04': 'Eastern Province',
  'SA-05': 'Al-Qassim',
  'SA-06': "Ha'il",
  'SA-07': 'Tabuk',
  'SA-08': 'Northern Borders',
  'SA-09': 'Jazan',
  'SA-10': 'Najran',
  'SA-11': 'Al Bahah',
  'SA-12': 'Al Jawf',
  'SA-14': 'Asir',

  // Qatar
  'QA-DA': 'Doha',
  'QA-RA': 'Al Rayyan',
  'QA-WA': 'Al Wakrah',
  'QA-KH': 'Al Khor',
  'QA-MS': 'Al Shamal',
  'QA-ZA': 'Al Daayen',
  'QA-US': 'Umm Salal',

  // Kuwait
  'KW-KU': 'Al Asimah',
  'KW-HA': 'Hawalli',
  'KW-FA': 'Farwaniya',
  'KW-AH': 'Ahmadi',
  'KW-JA': 'Jahra',
  'KW-MU': 'Mubarak Al-Kabeer',

  // Bahrain
  'BH-13': 'Capital',
  'BH-14': 'Southern',
  'BH-15': 'Muharraq',
  'BH-16': 'Central',
  'BH-17': 'Northern',

  // Oman
  'OM-MA': 'Muscat',
  'OM-ZU': 'Dhofar',
  'OM-BA': 'Al Batinah',
  'OM-DA': 'Ad Dakhiliyah',
  'OM-SH': 'Ash Sharqiyah',
  'OM-ZA': 'Adh Dhahirah',
  'OM-WU': 'Al Wusta',
  'OM-MU': 'Musandam',
  'OM-BU': 'Al Buraimi',
};
