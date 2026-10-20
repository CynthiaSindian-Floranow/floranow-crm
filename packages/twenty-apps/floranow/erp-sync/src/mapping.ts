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
  'on the 7th of the next month': 'NM_7TH',
  'on the 15th of the next month': 'NM_15TH',
  'on the 25th of the next month': 'NM_25TH',
  'on the 28th of the next month': 'NM_28TH',
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
  'internal': 'INTERNAL_UAE',
  'alissar': 'ALISSAR',
  'jeddah': 'JEDDAH',
  'dammam': 'DAMMAM',
  'riyadh': 'RIYADH',
  'riyadh central': 'RIYADH_CENTRAL',
  'al-khobar': 'AL_KHOBAR',
  'al khobar': 'AL_KHOBAR',
  'al-hasa': 'AL_HASA',
  'al hasa': 'AL_HASA',
  'qatif': 'QATIF',
  'medina': 'MEDINA',
  'hail': 'HAIL',
  'tabuk': 'TABUK',
  'qassim al-rass': 'QASSIM_AL_RASS',
  'qassim buriday': 'QASSIM_BURIDAH',
  'qassim buridah': 'QASSIM_BURIDAH',
  'qassim unaizah': 'QASSIM_UNAIZAH',
  'al jouf': 'AL_JOUF',
  'hafar': 'HAFAR',
  'kuwait': 'KUWAIT',
  'ne 04': 'NE_04',
};

// ERP warehouses.name → CRM warehouse enum. Anything else (Project X, TBF)
// deliberately falls through to OTHER.
const WAREHOUSE_MAP: Record<string, string> = {
  'dubai warehouse': 'DUBAI_WAREHOUSE',
  'jeddah warehouse': 'JEDDAH_WAREHOUSE',
  'dammam warehouse': 'DAMMAM_WAREHOUSE',
  'riyadh warehouse': 'RIYADH_WAREHOUSE',
  'medina warehouse': 'MEDINA_WAREHOUSE',
  'qassim warehouse': 'QASSIM_WAREHOUSE',
  'hail warehouse': 'HAIL_WAREHOUSE',
  'tabuk warehouse': 'TABUK_WAREHOUSE',
  'hafar warehouse': 'HAFAR_WAREHOUSE',
  'jouf warehouse': 'JOUF_WAREHOUSE',
  'ksa floranow national hub warehouse': 'KSA_NATIONAL_HUB',
  'jordan warehouse': 'JORDAN_WAREHOUSE',
  'kuwait warehouse': 'KUWAIT_WAREHOUSE',
  'qatar warehouse': 'QATAR_WAREHOUSE',
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

  return WAREHOUSE_MAP[name] ?? 'OTHER';
};

export const mapBlockedStatus = (
  blocked: ErpCustomerSnapshot['blocked'],
): string => {
  if (!blocked.blocked) {
    return 'UNBLOCKED';
  }

  return BLOCKED_STATUS_MAP[normalize(blocked.code)] ?? 'OTHER';
};

// Statuses only a human may set; the clock never writes over them.
const MANUAL_ONLY_STATUSES = new Set(['CLOSED', 'COLD_LIST']);

// The account-status clock (business decision D2, Oct 2026), computed from
// already-mirrored facts on every mirror run. An ERP block trumps the clock —
// and the ERP's own "allow overdue" exception is already folded into its
// blocked flag, so it is not re-derived here.
//   BLOCKED       — the ERP blocks the account
//   NEVER_ORDERED — no orders, ever
//   ACTIVE        — last order 7 days ago or less
//   INACTIVE      — 8 to 30 days since the last order
//   CHURNED       — more than 30 days
// Returns null when the status must be left alone (manual-only state, or an
// order history without a usable date — never guess).
export const computeAccountStatus = (
  currentStatus: unknown,
  blocked: ErpCustomerSnapshot['blocked'],
  lifetimeOrderCount: number | null,
  daysSinceLastOrder: number | null,
): string | null => {
  if (typeof currentStatus === 'string' && MANUAL_ONLY_STATUSES.has(currentStatus)) {
    return null;
  }

  if (blocked.blocked) {
    return 'BLOCKED';
  }

  if (!lifetimeOrderCount) {
    return 'NEVER_ORDERED';
  }

  if (daysSinceLastOrder === null) {
    return null;
  }

  if (daysSinceLastOrder <= 7) {
    return 'ACTIVE';
  }

  if (daysSinceLastOrder <= 30) {
    return 'INACTIVE';
  }

  return 'CHURNED';
};

// The protected window ends at day 60 after account creation and at day 60
// only (business decision D3, Oct 2026) — orders do not end it. The clear
// fires once (true → false); nothing ever re-protects an account, and a
// missing or unreadable creation date clears nothing.
// Note: for future legacy re-provisioning the anchor may need to be the real
// relationship start rather than the CRM creation date.
export const computeProtectedClear = (
  currentlyProtected: unknown,
  createdAt: unknown,
  today: Date = new Date(),
): boolean | null => {
  if (currentlyProtected !== true) {
    return null;
  }

  if (typeof createdAt !== 'string' || createdAt === '') {
    return null;
  }

  const created = new Date(createdAt);

  if (Number.isNaN(created.getTime())) {
    return null;
  }

  const ageDays = Math.floor(
    (today.getTime() - created.getTime()) / 86_400_000,
  );

  return ageDays >= 60 ? false : null;
};

// Two clocks (team decision, Oct 2026, option B): lifecycle moves to
// Retention at the 3rd order, independent of the protected window. Only the
// Onboarding → Retention hop is automated; Win-Back and Closed stay
// human-owned, so any stage other than Onboarding is left alone.
export const computeLifecycleStage = (
  currentStage: unknown,
  lifetimeOrderCount: number | null,
): string | null => {
  if (currentStage !== 'ONBOARDING') {
    return null;
  }

  return (lifetimeOrderCount ?? 0) >= 3 ? 'RETENTION' : null;
};

// Inactivity nudge (Ops Manual SOP-22, backlog item 5): when an account that
// has ordered before crosses 21 quiet days with no sub-tag, the owner gets a
// task to record the reason. The 45-day ceiling is the rollout cutoff decided
// on 20 Oct 2026: accounts already long-quiet at rollout never get an
// auto-task — the clock only watches accounts going quiet from now on.
export const shouldCreateInactivityTask = (
  subTag: unknown,
  lifetimeOrderCount: number | null,
  daysSinceLastOrder: number | null,
): boolean =>
  (subTag === null || subTag === undefined || subTag === '') &&
  (lifetimeOrderCount ?? 0) > 0 &&
  daysSinceLastOrder !== null &&
  daysSinceLastOrder >= 21 &&
  daysSinceLastOrder <= 45;

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

// The mirrored commercial group — the fields Job B is allowed to refresh on
// every run. Shared with provisioning so the two jobs can never disagree on a
// mapping. Never includes identity keys, name, or CRM-owned lifecycle fields.
export const buildMirrorFields = (
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
    arabicName: erp.arabic_name ?? undefined,
    vatNumber: erp.vat_number ?? undefined,
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
  };

  // Drop nulls so the API does not receive explicit nulls for SELECT fields.
  for (const key of Object.keys(fields)) {
    if (fields[key] === null || fields[key] === undefined) {
      delete fields[key];
    }
  }

  return { fields, unmapped };
};

// Builds the createCompany input. Only sync-owned fields are written — the
// CRM-owned lifecycle group gets its provisioning defaults here, once, and is
// never touched again by the pipeline.
export const buildCompanyPayload = (
  lead: LeadForMapping,
  erp: ErpCustomerSnapshot,
): CompanyPayload => {
  const mirror = buildMirrorFields(erp);
  const unmapped = [...mirror.unmapped];

  const track = (field: string, erpValue: string | null, mapped: unknown) => {
    if (erpValue !== null && erpValue !== '' && mapped === null) {
      unmapped.push({ field, erpValue });
    }

    return mapped;
  };

  const fields: Record<string, unknown> = {
    ...mirror.fields,

    name: erp.business_name || erp.name || lead.businessName || lead.name,
    debtorNumber: erp.debtor_number,
    erpUserId: erp.erp_user_id,

    vatNumber: erp.vat_number ?? lead.vatNumber ?? undefined,

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

  for (const key of Object.keys(fields)) {
    if (fields[key] === null || fields[key] === undefined) {
      delete fields[key];
    }
  }

  return { fields, unmapped };
};

// Financial mirror (Job B phase 2) — the read-only number fields fed by the
// ERP's /customers/financials endpoint. Money lands as Twenty CURRENCY
// composites; the currency code rides in from the customer snapshot since the
// aggregates themselves are currency-less. lastOrderChannel maps only the two
// CRM options; IN_SHOP, picked_order and friends are flagged, not guessed.
const LAST_ORDER_CHANNEL_MAP: Record<string, string> = {
  online: 'ONLINE',
  offline: 'OFFLINE',
  in_shop: 'IN_SHOP',
  additional: 'ADDITIONAL',
};

export const mapLastOrderChannel = (erpValue: string | null): string | null =>
  LAST_ORDER_CHANNEL_MAP[normalize(erpValue)] ?? null;

const money = (
  amount: string,
  currencyCode: string,
): { amountMicros: number | null; currencyCode: string } => ({
  amountMicros: toMicros(amount),
  currencyCode,
});

export type ErpFinancialsForMapping = {
  receivable: { total: string; overdue: string };
  receivable_months: { mtd: string; m1: string; m2: string; m3: string };
  revenue_months: { mtd: string; m1: string; m2: string; m3: string };
  orders: {
    lifetime_count: number;
    first_order_date: string | null;
    last_order_date: string | null;
    last_order_channel: string | null;
  };
};

export const buildFinancialFields = (
  financials: ErpFinancialsForMapping,
  currencyCode: string,
  today: Date = new Date(),
): CompanyPayload => {
  const unmapped: UnmappedValue[] = [];

  const channel = mapLastOrderChannel(financials.orders.last_order_channel);

  if (financials.orders.last_order_channel !== null && channel === null) {
    unmapped.push({
      field: 'lastOrderChannel',
      erpValue: financials.orders.last_order_channel,
    });
  }

  const lastOrderDate = financials.orders.last_order_date;
  const daysSinceLastOrder =
    lastOrderDate === null
      ? undefined
      : Math.max(
          0,
          Math.floor(
            (today.getTime() - new Date(lastOrderDate).getTime()) / 86_400_000,
          ),
        );

  const fields: Record<string, unknown> = {
    totalReceivable: money(financials.receivable.total, currencyCode),
    agingReceivable: money(financials.receivable.overdue, currencyCode),
    receivableMtd: money(financials.receivable_months.mtd, currencyCode),
    receivableM1: money(financials.receivable_months.m1, currencyCode),
    receivableM2: money(financials.receivable_months.m2, currencyCode),
    receivableM3: money(financials.receivable_months.m3, currencyCode),
    mtdNetRevenue: money(financials.revenue_months.mtd, currencyCode),
    m1NetRevenue: money(financials.revenue_months.m1, currencyCode),
    m2NetRevenue: money(financials.revenue_months.m2, currencyCode),
    m3NetRevenue: money(financials.revenue_months.m3, currencyCode),

    orderCountLifetime: financials.orders.lifetime_count,
    firstOrderAt: financials.orders.first_order_date ?? undefined,
    lastOrderDate: lastOrderDate ?? undefined,
    lastOrderChannel: channel,
    daysSinceLastOrder,
  };

  for (const key of Object.keys(fields)) {
    if (fields[key] === null || fields[key] === undefined) {
      delete fields[key];
    }
  }

  return { fields, unmapped };
};

// Standing orders (phase 3). ERP status REQUESTED means a live arrangement in
// the ERP; REJECTED/CANCELED are terminal. The CRM lifecycle (DRAFT is a
// CRM-only proposal state) maps as below; unknown statuses are flagged.
const STANDING_ORDER_STATUS_MAP: Record<string, string> = {
  requested: 'ACTIVE',
  rejected: 'ENDED',
  canceled: 'ENDED',
  cancelled: 'ENDED',
  failed: 'ENDED',
};

const STANDING_ORDER_DELIVERY_DAYS = new Set([
  'SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY',
]);

export const mapStandingOrderStatus = (erpValue: string | null): string | null =>
  STANDING_ORDER_STATUS_MAP[normalize(erpValue)] ?? null;

// frequency_period WEEK → WEEKLY; the ERP has no bi-weekly cadence today.
export const mapStandingOrderFrequency = (
  erpValue: string | null,
): string | null => (normalize(erpValue) === 'week' ? 'WEEKLY' : null);

export type ErpStandingOrderForMapping = {
  erp_reference: string;
  product_name: string | null;
  quantity: number | null;
  price: string | null;
  start_date: string | null;
  end_date: string | null;
  delivery_day: string | null;
  frequency_period: string | null;
  status: string | null;
};

export type StandingOrderPayload = {
  erpReference: string;
  fields: Record<string, unknown>;
  unmapped: UnmappedValue[];
};

// A one-line human summary of the basket, since the CRM tracks the proposal
// rather than line items.
const basketSummary = (so: ErpStandingOrderForMapping): string => {
  const parts = [so.product_name?.trim(), so.quantity ? `x${so.quantity}` : null]
    .filter(Boolean);

  return parts.join(' ');
};

export const buildStandingOrderFields = (
  so: ErpStandingOrderForMapping,
): StandingOrderPayload => {
  const unmapped: UnmappedValue[] = [];

  const track = (field: string, erpValue: string | null, mapped: unknown) => {
    if (erpValue !== null && erpValue !== '' && mapped === null) {
      unmapped.push({ field, erpValue });
    }

    return mapped;
  };

  const deliveryDay =
    so.delivery_day !== null && STANDING_ORDER_DELIVERY_DAYS.has(so.delivery_day)
      ? so.delivery_day
      : null;

  if (so.delivery_day !== null && deliveryDay === null) {
    unmapped.push({ field: 'deliveryDay', erpValue: so.delivery_day });
  }

  const fields: Record<string, unknown> = {
    name: so.product_name?.trim() || `Standing order ${so.erp_reference}`,
    erpReference: so.erp_reference,
    basketSummary: basketSummary(so) || undefined,
    confirmedQuantity: so.quantity ?? undefined,
    startDate: so.start_date ?? undefined,
    reviewDate: so.end_date ?? undefined,
    deliveryDay,
    frequency: track(
      'frequency',
      so.frequency_period,
      mapStandingOrderFrequency(so.frequency_period),
    ),
    status: track('status', so.status, mapStandingOrderStatus(so.status)),
  };

  for (const key of Object.keys(fields)) {
    if (fields[key] === null || fields[key] === undefined) {
      delete fields[key];
    }
  }

  return { erpReference: so.erp_reference, fields, unmapped };
};

// Order events (phase 3). order_type online/offline → CRM channel; anything
// else is flagged. eventType comes straight from the ERP's derived state.
const ORDER_CHANNEL_MAP: Record<string, string> = {
  online: 'ONLINE',
  offline: 'OFFLINE',
  in_shop: 'IN_SHOP',
  additional: 'ADDITIONAL',
};

const ORDER_EVENT_TYPES = new Set([
  'CREATED', 'DISPATCHED', 'DELIVERED', 'RATING_RECEIVED', 'BLOCKED_ATTEMPT',
]);

export type ErpOrderEventForMapping = {
  order_ref: string;
  erp_order_id: number;
  channel: string | null;
  value: string | null;
  currency: string | null;
  delivered_date: string | null;
  event_type: string;
};

export type ChildPayload = {
  ref: string;
  fields: Record<string, unknown>;
  unmapped: UnmappedValue[];
};

export const buildOrderEventFields = (
  event: ErpOrderEventForMapping,
): ChildPayload => {
  const unmapped: UnmappedValue[] = [];

  const channel = ORDER_CHANNEL_MAP[normalize(event.channel)] ?? null;
  if (event.channel !== null && channel === null) {
    unmapped.push({ field: 'channel', erpValue: event.channel });
  }

  const eventType = ORDER_EVENT_TYPES.has(event.event_type)
    ? event.event_type
    : null;
  if (eventType === null) {
    unmapped.push({ field: 'eventType', erpValue: event.event_type });
  }

  const fields: Record<string, unknown> = {
    name: `Order ${event.order_ref}`,
    orderRef: event.order_ref,
    erpOrderId: event.erp_order_id,
    channel,
    eventType,
    value:
      event.value === null
        ? undefined
        : { amountMicros: toMicros(event.value), currencyCode: event.currency || 'AED' },
    // The ERP's delivered date is what promotes an event to DELIVERED; the CRM
    // object has no separate delivered-date field, so it is not stored again.
  };

  for (const key of Object.keys(fields)) {
    if (fields[key] === null || fields[key] === undefined) {
      delete fields[key];
    }
  }

  return { ref: event.order_ref, fields, unmapped };
};

// Incidents (phase 3). Only the unambiguous ERP types map; the CRM adds its own
// categories, so everything else is flagged rather than forced.
const INCIDENT_CATEGORY_MAP: Record<string, string> = {
  missing: 'MISSING_ITEM',
  damaged: 'DAMAGE',
  extra: 'EXTRA',
  incorrect_item: 'INCORRECT_ITEM',
  returned: 'RETURNED',
};

const INCIDENT_STATUS_MAP: Record<string, string> = {
  reported: 'OPEN',
  closed: 'RESOLVED',
};

export type ErpIncidentForMapping = {
  erp_incident_id: number;
  incident_type: string | null;
  stage: string | null;
  status: string | null;
  quantity: number | null;
  credited: boolean;
  order_ref: string | null;
};

export const mapIncidentCategory = (erpValue: string | null): string | null =>
  INCIDENT_CATEGORY_MAP[normalize(erpValue)] ?? null;

export const buildIncidentFields = (
  incident: ErpIncidentForMapping,
): ChildPayload => {
  const unmapped: UnmappedValue[] = [];

  const category = mapIncidentCategory(incident.incident_type);
  if (incident.incident_type !== null && category === null) {
    unmapped.push({ field: 'category', erpValue: incident.incident_type });
  }

  // Blank ERP status is the common case (reported-but-unset) → OPEN.
  const status =
    normalize(incident.status) === ''
      ? 'OPEN'
      : INCIDENT_STATUS_MAP[normalize(incident.status)] ?? null;
  if (incident.status !== null && incident.status !== '' && status === null) {
    unmapped.push({ field: 'status', erpValue: incident.status });
  }

  const ref = String(incident.erp_incident_id);

  const fields: Record<string, unknown> = {
    name: `Incident ${ref}`,
    erpIncidentId: incident.erp_incident_id,
    category,
    status: status ?? 'OPEN',
    compensationAction: incident.credited ? 'CREDIT_NEXT_ORDER' : 'NONE',
  };

  for (const key of Object.keys(fields)) {
    if (fields[key] === null || fields[key] === undefined) {
      delete fields[key];
    }
  }

  return { ref, fields, unmapped };
};
