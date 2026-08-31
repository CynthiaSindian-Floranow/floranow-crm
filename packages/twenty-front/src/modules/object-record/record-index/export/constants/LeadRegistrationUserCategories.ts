// Customer Category (CRM) -> User category (marketplace template), keyed by the
// CRM option's stored value.
//
// Six of the nine map straight across. Supermarkets differs only in the
// template's capitalisation. INTERNAL_USERS and INTERNAL_BUYERS have no
// counterpart in the template's list, so they export blank rather than being
// guessed into "Internal" or "Internal Wholesale" — a wrong category is harder
// to spot downstream than an empty one.
export const LEAD_REGISTRATION_USER_CATEGORY_BY_VALUE: Record<string, string> =
  {
    HOTELS: 'Hotels',
    ONLINE: 'Online',
    PLANT_NURSERIES: 'Plant Nurseries',
    RETAIL_SHOPS: 'Retail Shops',
    SUPERMARKETS: 'SuperMarkets',
    WEDDINGS_EVENTS: 'Weddings & Events',
    WHOLESALER: 'Wholesaler',
    INTERNAL_USERS: '',
    INTERNAL_BUYERS: '',
  };
