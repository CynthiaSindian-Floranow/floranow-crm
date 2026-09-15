import { type ErpCustomerSnapshot } from './erp-client';

// Enum values below are the dev/prod workspace SELECT options, verified against
// the workspace metadata on 2026-09-15. `yarn model:check` in ../data-model
// guards them from drifting silently.

const COMPANY_CUSTOMER_TYPES = new Set(['RETAIL', 'RESELLER', 'FOB', 'CIF']);

const COMPANY_ACQUISITION_SOURCES = new Set([
  'SM_ADS', 'SM_DM', 'SM_MESSAGE', 'MP_CHAT', 'MP_SELFREG', 'MP_CARE',
  'REF_AM', 'REF_PARTNER', 'REF_ACCOUNT', 'SCRAPE_MAPS', 'SCRAPE_BLEEMS',
  'SCRAPE_FLOOWW', 'SCRAPE_OTHER', 'WALK_IN', 'EVENT', 'OUTBOUND',
  'INBOUND_CALL', 'WEBSITE', 'OTHER', 'LEGACY_MIGRATION',
]);

// ERP payment_terms.name display strings → CRM paymentTerm enum.
const PAYMENT_TERM_MAP: Record<string, string> = {
  'cash on delivery': 'COD',
  'prepay': 'PREPAY',
  'prepaid': 'PREPAY',
  '7 days after delivery': 'NET7',
  '7 days': 'NET7',
  '14 days': 'NET14',
  '14 days after delivery': 'NET14',
  '15 days': 'NET15',
  '15 days after delivery': 'NET15',
  '30 days': 'NET30',
  '30 days after delivery': 'NET30',
  '45 days': 'NET45',
  '45 days after delivery': 'NET45',
  '60 days': 'NET60',
  '60 days after delivery': 'NET60',
  '90 days': 'NET90',
  '90 days after delivery': 'NET90',
  '7th next month': 'NM_7TH',
  '15th next month': 'NM_15TH',
  '25th next month': 'NM_25TH',
  '28th next month': 'NM_28TH',
  'without invoicing': 'WITHOUT_INVOICING',
};

// ERP routes.name → CRM erpRoute enum.
const ERP_ROUTE_MAP: Record<string, string> = {
  'dubai city': 'DUBAI_CITY',
  'dubai out of city': 'DUBAI_OUT_OF_CITY',
  'abu dhabi city': 'ABU_DHABI_CITY',
  'abu dhabi out of city': 'ABU_DHABI_OUT_OF_CITY',
  'sharjah': 'SHARJAH',
  'ajman': 'AJMAN',
  'ras al khaimah': 'RAS_AL_KHAIMAH',
  'al ain': 'AL_AIN',
  'al ain 1': 'AL_AIN_1',
  'northern emirates': 'NORTHERN_EMIRATES',
  'umm al quwain': 'UMM_AL_QUWAIN',
  'fujairah': 'FUJAIRAH',
  'supermarkets': 'SUPERMARKETS',
  'hotels': 'HOTELS',
  'internal-uae': 'INTERNAL_UAE',
  'internal uae': 'INTERNAL_UAE',
  'alissar': 'ALISSAR',
};

// ERP user_categories.name → CRM accountCategory enum. "Deleted Customers"
// and "Closed" have no CRM option on purpose: a lead pointing at one of those
// is a data problem to surface, not a category to record.
const ACCOUNT_CATEGORY_MAP: Record<string, string> = {
  'retail shops': 'RETAIL_SHOP',
  'hotels': 'HOTEL',
  'supermarkets': 'SUPERMARKET',
  'weddings & events': 'WEDDINGS_EVENTS',
  'micro-buyer': 'MICRO_BUYER',
  'online': 'ONLINE',
  'bulk': 'BULK',
  'fully serviced': 'FULLY_SERVICED',
};

const BLOCKED_STATUS_MAP: Record<string, string> = {
  unblocked: 'UNBLOCKED',
  manual_block: 'MANUAL_BLOCK',
  exceed_limit: 'EXCEED_LIMIT',
  overdue_invoices: 'OVERDUE_INVOICES',
};

const normalize = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase();

export type UnmappedValue = { field: string; erpValue: string };

export type CompanyPayload = {
  fields: Record<string, unknown>;
  unmapped: UnmappedValue[];
};

export const mapCustomerType = (erpValue: string | null): string | null => {
  const candidate = normalize(erpValue).toUpperCase();

  return COMPANY_CUSTOMER_TYPES.has(candidate) ? candidate : null;
};

export const mapAccountCategory = (erpValue: string | null): string | null =>
  ACCOUNT_CATEGORY_MAP[normalize(erpValue)] ?? null;

export const mapPaymentTerm = (erpValue: string | null): string | null =>
  PAYMENT_TERM_MAP[normalize(erpValue)] ?? null;

export const mapErpRoute = (erpValue: string | null): string | null =>
  ERP_ROUTE_MAP[normalize(erpValue)] ?? null;

export const mapWarehouse = (erpValue: string | null): string | null => {
  const name = normalize(erpValue);

  if (name === '') {
    return null;
  }

  return name === 'dubai warehouse' ? 'DUBAI_WAREHOUSE' : 'OTHER';
};

export const mapBlockedStatus = (
  blocked: ErpCustomerSnapshot['blocked'],
): string => {
  if (!blocked.blocked) {
    return 'UNBLOCKED';
  }

  return BLOCKED_STATUS_MAP[normalize(blocked.code)] ?? 'OTHER';
};

// Lead.source and Company.acquisitionSource share values except SCRAPE_SOCIAL,
// which only exists on the lead.
export const mapAcquisitionSource = (
  leadSource: string | null,
): string | null => {
  if (leadSource === null || leadSource === '') {
    return null;
  }

  if (COMPANY_ACQUISITION_SOURCES.has(leadSource)) {
    return leadSource;
  }

  return leadSource === 'SCRAPE_SOCIAL' ? 'SCRAPE_OTHER' : null;
};

const toNumber = (value: string | number | null): number | null => {
  if (value === null || value === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const toMicros = (value: string | null): number | null => {
  const parsed = toNumber(value);

  return parsed === null ? null : Math.round(parsed * 1_000_000);
};

export type LeadForMapping = {
  name: string;
  businessName: string | null;
  source: string | null;
  vatNumber: string | null;
};

// Builds the createCompany input. Only sync-owned fields are written — the
// CRM-owned lifecycle group gets its provisioning defaults here, once, and is
// never touched again by the pipeline.
export const buildCompanyPayload = (
  lead: LeadForMapping,
  erp: ErpCustomerSnapshot,
): CompanyPayload => {
  const unmapped: UnmappedValue[] = [];

  const track = (field: string, erpValue: string | null, mapped: unknown) => {
    if (erpValue !== null && erpValue !== '' && mapped === null) {
      unmapped.push({ field, erpValue });
    }

    return mapped;
  };

  const fields: Record<string, unknown> = {
    name: erp.business_name || erp.name || lead.businessName || lead.name,
    debtorNumber: erp.debtor_number,
    erpUserId: erp.erp_user_id,

    arabicName: erp.arabic_name ?? undefined,
    vatNumber: erp.vat_number ?? lead.vatNumber ?? undefined,
    tradeLicense: erp.trade_license ?? undefined,

    customerType: track(
      'customerType',
      erp.customer_type,
      mapCustomerType(erp.customer_type),
    ),
    paymentTerm: track(
      'paymentTerm',
      erp.payment_term,
      mapPaymentTerm(erp.payment_term),
    ),
    accountCategory: track(
      'accountCategory',
      erp.user_category,
      mapAccountCategory(erp.user_category),
    ),
    warehouse: mapWarehouse(erp.warehouse),
    erpRoute: track('erpRoute', erp.route, mapErpRoute(erp.route)),
    erpBlockedStatus: mapBlockedStatus(erp.blocked),

    creditLimit:
      erp.credit_limit === null
        ? undefined
        : {
            amountMicros: toMicros(erp.credit_limit),
            currencyCode: erp.currency || 'AED',
          },

    address: {
      addressStreet1: erp.address.street ?? '',
      addressCity: erp.address.city ?? '',
      addressState: erp.address.state ?? '',
      addressCountry: erp.address.country ?? '',
      addressLat: toNumber(erp.address.latitude),
      addressLng: toNumber(erp.address.longitude),
    },
    latitude: toNumber(erp.address.latitude) ?? undefined,
    longitude: toNumber(erp.address.longitude) ?? undefined,

    acquisitionSource: track(
      'acquisitionSource',
      lead.source,
      mapAcquisitionSource(lead.source),
    ),

    // Provisioning defaults (BRD registration state) — set once, CRM-owned
    // from here on.
    accountStatus: 'NEVER_ORDERED',
    lifecycleStage: 'ONBOARDING',
    newClientProtected: true,
    protectedOrdersCount: 0,
    paymentTrack: 'AMBER',
  };

  // Drop nulls so the API does not receive explicit nulls for SELECT fields.
  for (const key of Object.keys(fields)) {
    if (fields[key] === null || fields[key] === undefined) {
      delete fields[key];
    }
  }

  return { fields, unmapped };
};
