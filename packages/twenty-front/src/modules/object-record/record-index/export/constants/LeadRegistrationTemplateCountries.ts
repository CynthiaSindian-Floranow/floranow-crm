// The only countries the marketplace template's Country column accepts — its
// `Countries_` named range. A lead outside these exports a blank Country and
// City rather than a value the importer would reject.
//
// Kept in sync by leadRegistrationTemplateVocabulary.test.ts, which reads the
// committed qualified-leads.xlsx and fails if this list drifts from it.
export const LEAD_REGISTRATION_TEMPLATE_COUNTRIES = [
  'Iraq',
  'Jordan',
  'Kuwait',
  'Qatar',
  'Saudi Arabia',
  'United Arab Emirates',
];
