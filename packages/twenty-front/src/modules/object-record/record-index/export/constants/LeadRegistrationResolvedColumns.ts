// The four columns that cannot be read straight off a lead: each has to be
// spelled the way the marketplace's own list expects, and City is the one
// column Excel actually validates. buildLeadRegistrationRows fills them in by
// column index after the plain columns have been mapped.
export const LEAD_REGISTRATION_RESOLVED_COLUMNS = {
  segment: 'Segment',
  country: 'Country',
  city: 'City',
  userCategory: 'User category',
} as const;
