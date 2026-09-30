import { type SyncConfig } from './env';

// Shape returned by GET /api/integration/customers on the ERP
// (CrmCustomerSnapshotService#snapshot).
export type ErpCustomerSnapshot = {
  debtor_number: string;
  erp_user_id: number;
  name: string | null;
  business_name: string | null;
  arabic_name: string | null;
  vat_number: string | null;
  trade_license: string | null;
  email: string | null;
  phone_number: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    country_code: string | null;
    latitude: string | number | null;
    longitude: string | number | null;
  };
  customer_type: string | null;
  internal: boolean;
  user_category: string | null;
  payment_term: string | null;
  route: string | null;
  warehouse: string | null;
  credit_limit: string | null;
  remaining_credit: string | null;
  currency: string | null;
  blocked: {
    blocked: boolean;
    code: string | null;
    message: string | null;
    cached_status: string | null;
    computed: boolean;
  };
  updated_at: string | null;
  blocked_status_refreshed_at: string | null;
};

export type ErpBulkResult = {
  found: Map<string, ErpCustomerSnapshot>;
  notFound: string[];
};

export const fetchErpCustomers = async (
  config: SyncConfig,
  debtorNumbers: string[],
): Promise<ErpBulkResult> => {
  if (debtorNumbers.length === 0) {
    return { found: new Map(), notFound: [] };
  }

  const query = debtorNumbers
    .map((n) => `debtor_numbers[]=${encodeURIComponent(n)}`)
    .join('&');

  const response = await fetch(
    `${config.erpUrl}/api/integration/customers?${query}`,
    { headers: { 'X-Api-Key': config.erpApiKey } },
  );

  if (!response.ok) {
    throw new Error(
      `ERP bulk customer read failed: HTTP ${response.status} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as {
    success: boolean;
    data: ErpCustomerSnapshot[];
    not_found: string[];
  };

  if (!body.success) {
    throw new Error('ERP bulk customer read reported success: false');
  }

  return {
    found: new Map(body.data.map((c) => [c.debtor_number, c])),
    notFound: body.not_found ?? [],
  };
};

// Shape returned by GET /api/integration/customers/financials
// (CrmCustomerFinancialsService).
export type ErpCustomerFinancials = {
  debtor_number: string;
  erp_user_id: number;
  receivable: { total: string; overdue: string };
  receivable_months: { mtd: string; m1: string; m2: string; m3: string };
  revenue_months: { mtd: string; m1: string; m2: string; m3: string };
  orders: {
    lifetime_count: number;
    first_order_date: string | null;
    last_order_date: string | null;
    last_order_channel: string | null;
  };
  as_of: string;
};

export type ErpFinancialsResult = {
  found: Map<string, ErpCustomerFinancials>;
  notFound: string[];
};

export const fetchErpFinancials = async (
  config: SyncConfig,
  debtorNumbers: string[],
): Promise<ErpFinancialsResult> => {
  if (debtorNumbers.length === 0) {
    return { found: new Map(), notFound: [] };
  }

  const query = debtorNumbers
    .map((n) => `debtor_numbers[]=${encodeURIComponent(n)}`)
    .join('&');

  const response = await fetch(
    `${config.erpUrl}/api/integration/customers/financials?${query}`,
    { headers: { 'X-Api-Key': config.erpApiKey } },
  );

  if (!response.ok) {
    throw new Error(
      `ERP financials read failed: HTTP ${response.status} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as {
    success: boolean;
    data: ErpCustomerFinancials[];
    not_found: string[];
  };

  if (!body.success) {
    throw new Error('ERP financials read reported success: false');
  }

  return {
    found: new Map(body.data.map((c) => [c.debtor_number, c])),
    notFound: body.not_found ?? [],
  };
};

// Shape returned by GET /api/integration/customers/standing_orders
export type ErpStandingOrder = {
  erp_reference: string;
  product_name: string | null;
  quantity: number | null;
  price: string | null;
  start_date: string | null;
  end_date: string | null;
  delivery_day: string | null;
  frequency_period: string | null;
  status: string | null;
  currency: string | null;
};

export type ErpCustomerStandingOrders = {
  debtor_number: string;
  erp_user_id: number;
  standing_orders: ErpStandingOrder[];
};

export const fetchErpStandingOrders = async (
  config: SyncConfig,
  debtorNumbers: string[],
): Promise<Map<string, ErpStandingOrder[]>> => {
  if (debtorNumbers.length === 0) {
    return new Map();
  }

  const query = debtorNumbers
    .map((n) => `debtor_numbers[]=${encodeURIComponent(n)}`)
    .join('&');

  const response = await fetch(
    `${config.erpUrl}/api/integration/customers/standing_orders?${query}`,
    { headers: { 'X-Api-Key': config.erpApiKey } },
  );

  if (!response.ok) {
    throw new Error(
      `ERP standing orders read failed: HTTP ${response.status} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as {
    success: boolean;
    data: ErpCustomerStandingOrders[];
  };

  if (!body.success) {
    throw new Error('ERP standing orders read reported success: false');
  }

  return new Map(body.data.map((c) => [c.debtor_number, c.standing_orders]));
};
