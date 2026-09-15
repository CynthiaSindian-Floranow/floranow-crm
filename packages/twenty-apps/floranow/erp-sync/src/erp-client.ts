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
