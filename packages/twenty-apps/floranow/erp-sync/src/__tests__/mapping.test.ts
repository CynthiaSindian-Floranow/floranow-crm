import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type ErpCustomerSnapshot } from '../erp-client';
import {
  buildCompanyPayload,
  mapAccountCategory,
  mapAcquisitionSource,
  mapBlockedStatus,
  mapCustomerType,
  mapErpRoute,
  mapPaymentTerm,
  mapWarehouse,
} from '../mapping';

const snapshot = (overrides: Partial<ErpCustomerSnapshot> = {}): ErpCustomerSnapshot => ({
  debtor_number: 'D-100',
  erp_user_id: 42,
  name: 'Rose Sky',
  business_name: 'Rose Sky Trading',
  arabic_name: null,
  vat_number: '100200300',
  trade_license: 'CN-1234',
  email: 'rose@example.com',
  phone_number: '+971501234567',
  address: {
    street: '12 Al Wasl Rd',
    city: 'Dubai',
    state: null,
    country: 'United Arab Emirates',
    country_code: 'AE',
    latitude: '25.2048',
    longitude: '55.2708',
  },
  customer_type: 'retail',
  internal: false,
  user_category: 'Retail Shops',
  payment_term: 'Cash on Delivery',
  route: 'Dubai City',
  warehouse: 'Dubai Warehouse',
  credit_limit: '4000.0',
  remaining_credit: '4000.0',
  currency: 'AED',
  blocked: {
    blocked: false,
    code: null,
    message: null,
    cached_status: 'unblocked',
    computed: true,
  },
  updated_at: null,
  blocked_status_refreshed_at: null,
  ...overrides,
});

const lead = {
  name: 'Rose Sky lead',
  businessName: 'Rose Sky',
  source: 'WALK_IN',
  vatNumber: null,
};

test('customer types map by name, unknown types are dropped', () => {
  assert.equal(mapCustomerType('retail'), 'RETAIL');
  assert.equal(mapCustomerType('fob'), 'FOB');
  assert.equal(mapCustomerType('agent'), null);
  assert.equal(mapCustomerType(null), null);
});

test('payment term display strings map to the enum', () => {
  assert.equal(mapPaymentTerm('Cash on Delivery'), 'COD');
  assert.equal(mapPaymentTerm('60 Days After Delivery'), 'NET60');
  assert.equal(mapPaymentTerm('7th Next Month'), 'NM_7TH');
  assert.equal(mapPaymentTerm('Without invoicing'), 'WITHOUT_INVOICING');
  // Real value on the dev ERP with no CRM option — must not guess.
  assert.equal(mapPaymentTerm('10 Days After Delivery'), null);
});

test('warehouses collapse to the two CRM options', () => {
  assert.equal(mapWarehouse('Dubai Warehouse'), 'DUBAI_WAREHOUSE');
  assert.equal(mapWarehouse('Riyadh Warehouse'), 'OTHER');
  assert.equal(mapWarehouse(null), null);
});

test('routes map where known and are dropped where not', () => {
  assert.equal(mapErpRoute('Dubai Out of City'), 'DUBAI_OUT_OF_CITY');
  assert.equal(mapErpRoute('Internal-UAE'), 'INTERNAL_UAE');
  assert.equal(mapErpRoute('Jeddah'), null);
});

test('blocked state maps to the enum with OTHER as the fallback', () => {
  assert.equal(
    mapBlockedStatus({ blocked: false, code: null, message: null, cached_status: null, computed: true }),
    'UNBLOCKED',
  );
  assert.equal(
    mapBlockedStatus({ blocked: true, code: 'exceed_limit', message: null, cached_status: null, computed: true }),
    'EXCEED_LIMIT',
  );
  assert.equal(
    mapBlockedStatus({ blocked: true, code: 'strange_new_code', message: null, cached_status: null, computed: true }),
    'OTHER',
  );
});

test('lead source carries over, SCRAPE_SOCIAL falls back to SCRAPE_OTHER', () => {
  assert.equal(mapAcquisitionSource('WALK_IN'), 'WALK_IN');
  assert.equal(mapAcquisitionSource('SCRAPE_SOCIAL'), 'SCRAPE_OTHER');
  assert.equal(mapAcquisitionSource(null), null);
});

test('account categories map by label; dead categories are flagged, not stored', () => {
  assert.equal(mapAccountCategory('Retail Shops'), 'RETAIL_SHOP');
  assert.equal(mapAccountCategory('Weddings & Events'), 'WEDDINGS_EVENTS');
  assert.equal(mapAccountCategory('SuperMarkets'), 'SUPERMARKET');
  assert.equal(mapAccountCategory('Deleted Customers'), null);
  assert.equal(mapAccountCategory('Closed'), null);
  assert.equal(mapAccountCategory(null), null);
});

test('company payload carries identity, mirror fields and provisioning defaults', () => {
  const { fields, unmapped } = buildCompanyPayload(lead, snapshot());

  assert.equal(fields.accountCategory, 'RETAIL_SHOP');
  assert.equal(fields.name, 'Rose Sky Trading');
  assert.equal(fields.debtorNumber, 'D-100');
  assert.equal(fields.erpUserId, 42);
  assert.equal(fields.customerType, 'RETAIL');
  assert.equal(fields.paymentTerm, 'COD');
  assert.equal(fields.warehouse, 'DUBAI_WAREHOUSE');
  assert.equal(fields.erpRoute, 'DUBAI_CITY');
  assert.equal(fields.erpBlockedStatus, 'UNBLOCKED');
  assert.deepEqual(fields.creditLimit, {
    amountMicros: 4_000_000_000,
    currencyCode: 'AED',
  });
  assert.equal(fields.accountStatus, 'NEVER_ORDERED');
  assert.equal(fields.lifecycleStage, 'ONBOARDING');
  assert.equal(fields.newClientProtected, true);
  assert.equal(fields.paymentTrack, 'AMBER');
  assert.equal(fields.acquisitionSource, 'WALK_IN');
  assert.equal(fields.latitude, 25.2048);
  assert.deepEqual(unmapped, []);
});

test('unmappable ERP values are reported, not guessed', () => {
  const { fields, unmapped } = buildCompanyPayload(
    lead,
    snapshot({
      payment_term: '10 Days After Delivery',
      route: 'Jeddah',
      customer_type: 'agent',
    }),
  );

  assert.equal(fields.paymentTerm, undefined);
  assert.equal(fields.erpRoute, undefined);
  assert.equal(fields.customerType, undefined);
  assert.deepEqual(
    unmapped.map((u) => u.field).sort(),
    ['customerType', 'erpRoute', 'paymentTerm'],
  );
});

test('no SELECT field is ever sent as an explicit null', () => {
  const { fields } = buildCompanyPayload(
    lead,
    snapshot({ payment_term: null, route: null, warehouse: null, credit_limit: null }),
  );

  for (const [key, value] of Object.entries(fields)) {
    assert.notEqual(value, null, `${key} must not be null`);
  }
});
