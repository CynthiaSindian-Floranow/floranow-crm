// The marketplace template spells places without accents — "Khawr Fakkan",
// "Abu Arish", "Al-Ula" — while the CRM stores the source spelling with them:
// "Khawr Fakkān", "Abū ‘Arīsh", "Al-`Ula". Both come from the same city list, so
// dropping the combining marks and the various ayn/hamza glyphs turns one into
// the other exactly.
//
// The plain ASCII apostrophe is deliberately NOT in this set: the template
// itself writes "Ha'il", so stripping it would produce "Hail" and fail the
// column's validation.
const AYN_AND_HAMZA = /[‘’`ʻʼʿʾ]/g;

export const normalizeTemplateText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(AYN_AND_HAMZA, '')
    .replace(/\s+/g, ' ')
    .trim();

// For comparing two spellings of the same place regardless of case.
export const templateTextKey = (value: string): string =>
  normalizeTemplateText(value).toLowerCase();
