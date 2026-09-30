import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type ErpCustomerSnapshot } from '../erp-client';
import {
  buildCompanyPayload,
  buildFinancialFields,
  buildMirrorFields,
  buildIncidentFields,
  buildOrderEventFields,
  buildStandingOrderFields,
  mapStandingOrderStatus,
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

test('warehouses map across UAE and KSA; unknown ones become Other', () => {
  assert.equal(mapWarehouse('Dubai Warehouse'), 'DUBAI_WAREHOUSE');
  assert.equal(mapWarehouse('Riyadh Warehouse'), 'RIYADH_WAREHOUSE');
  assert.equal(mapWarehouse('Jeddah Warehouse'), 'JEDDAH_WAREHOUSE');
  assert.equal(mapWarehouse('Hafar WareHouse'), 'HAFAR_WAREHOUSE');
  assert.equal(
    mapWarehouse('KSA Floranow National Hub Warehouse'),
    'KSA_NATIONAL_HUB',
  );
  assert.equal(mapWarehouse('Riyadh Project X'), 'OTHER');
  assert.equal(mapWarehouse('Jeddah TBF'), 'OTHER');
  assert.equal(mapWarehouse(null), null);
});

test('routes map across UAE and KSA and are dropped where unknown', () => {
  assert.equal(mapErpRoute('Dubai Out of City'), 'DUBAI_OUT_OF_CITY');
  assert.equal(mapErpRoute('Internal-UAE'), 'INTERNAL_UAE');
  assert.equal(mapErpRoute('Internal'), 'INTERNAL_UAE');
  assert.equal(mapErpRoute('Jeddah'), 'JEDDAH');
  assert.equal(mapErpRoute('Riyadh Central'), 'RIYADH_CENTRAL');
  assert.equal(mapErpRoute('Al-Khobar'), 'AL_KHOBAR');
  // The ERP spells it "Buriday"; both spellings resolve.
  assert.equal(mapErpRoute('Qassim Buriday'), 'QASSIM_BURIDAH');
  assert.equal(mapErpRoute('Dammam- Deleted'), null);
  assert.equal(mapErpRoute('Stock-Linking (Internal)'), null);
  assert.equal(mapErpRoute('Grandiose'), null);
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
      route: 'Grandiose',
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

test('mirror fields never include identity, name, or CRM-owned defaults', () => {
  const { fields } = buildMirrorFields(snapshot());

  for (const forbidden of [
    'name', 'debtorNumber', 'erpUserId', 'acquisitionSource',
    'accountStatus', 'lifecycleStage', 'newClientProtected', 'paymentTrack',
  ]) {
    assert.equal(forbidden in fields, false, `${forbidden} must not be mirrored`);
  }

  assert.equal(fields.warehouse, 'DUBAI_WAREHOUSE');
  assert.equal(fields.erpBlockedStatus, 'UNBLOCKED');
});

const financials = {
  receivable: { total: '4500.5', overdue: '1200.0' },
  receivable_months: { mtd: '300.0', m1: '0.0', m2: '0.0', m3: '900.0' },
  revenue_months: { mtd: '850.0', m1: '700.0', m2: '0.0', m3: '0.0' },
  orders: {
    lifetime_count: 12,
    first_order_date: '2026-01-10',
    last_order_date: '2026-09-20',
    last_order_channel: 'ONLINE',
  },
};

test('financial fields land as currency composites with the customer currency', () => {
  const { fields, unmapped } = buildFinancialFields(
    financials,
    'AED',
    new Date('2026-09-30T00:00:00Z'),
  );

  assert.deepEqual(fields.totalReceivable, { amountMicros: 4_500_500_000, currencyCode: 'AED' });
  assert.deepEqual(fields.agingReceivable, { amountMicros: 1_200_000_000, currencyCode: 'AED' });
  assert.deepEqual(fields.mtdNetRevenue, { amountMicros: 850_000_000, currencyCode: 'AED' });
  assert.deepEqual(fields.receivableM3, { amountMicros: 900_000_000, currencyCode: 'AED' });
  assert.equal(fields.orderCountLifetime, 12);
  assert.equal(fields.firstOrderAt, '2026-01-10');
  assert.equal(fields.lastOrderDate, '2026-09-20');
  assert.equal(fields.lastOrderChannel, 'ONLINE');
  assert.equal(fields.daysSinceLastOrder, 10);
  assert.deepEqual(unmapped, []);
});

test('unknown order channels are flagged, never guessed', () => {
  const { fields, unmapped } = buildFinancialFields(
    { ...financials, orders: { ...financials.orders, last_order_channel: 'picked_order' } },
    'SAR',
  );

  assert.equal(fields.lastOrderChannel, undefined);
  assert.deepEqual(unmapped, [{ field: 'lastOrderChannel', erpValue: 'picked_order' }]);
});

test('a customer with no orders gets zeros and no dates', () => {
  const { fields } = buildFinancialFields(
    {
      receivable: { total: '0.0', overdue: '0.0' },
      receivable_months: { mtd: '0.0', m1: '0.0', m2: '0.0', m3: '0.0' },
      revenue_months: { mtd: '0.0', m1: '0.0', m2: '0.0', m3: '0.0' },
      orders: { lifetime_count: 0, first_order_date: null, last_order_date: null, last_order_channel: null },
    },
    'AED',
  );

  assert.equal(fields.orderCountLifetime, 0);
  assert.equal(fields.lastOrderDate, undefined);
  assert.equal(fields.daysSinceLastOrder, undefined);
  assert.deepEqual(fields.totalReceivable, { amountMicros: 0, currencyCode: 'AED' });
});

test('standing order maps to CRM fields with erpReference as the join key', () => {
  const { erpReference, fields, unmapped } = buildStandingOrderFields({
    erp_reference: '18',
    product_name: 'Sg Phil.red Beauty',
    quantity: 5,
    price: '40.0',
    start_date: '2022-11-01',
    end_date: '2022-11-30',
    delivery_day: 'SATURDAY',
    frequency_period: 'week',
    status: 'requested',
  });

  assert.equal(erpReference, '18');
  assert.equal(fields.name, 'Sg Phil.red Beauty');
  assert.equal(fields.erpReference, '18');
  assert.equal(fields.confirmedQuantity, 5);
  assert.equal(fields.deliveryDay, 'SATURDAY');
  assert.equal(fields.frequency, 'WEEKLY');
  assert.equal(fields.status, 'ACTIVE');
  assert.equal(fields.startDate, '2022-11-01');
  assert.deepEqual(unmapped, []);
});

test('terminal ERP statuses map to ENDED; unknown ones are flagged', () => {
  assert.equal(mapStandingOrderStatus('rejected'), 'ENDED');
  assert.equal(mapStandingOrderStatus('canceled'), 'ENDED');
  assert.equal(mapStandingOrderStatus('confirmed'), null);

  const { unmapped } = buildStandingOrderFields({
    erp_reference: '9', product_name: 'X', quantity: 1, price: null,
    start_date: null, end_date: null, delivery_day: 'SATURDAY',
    frequency_period: 'week', status: 'confirmed',
  });
  assert.deepEqual(unmapped, [{ field: 'status', erpValue: 'confirmed' }]);
});

test('order event maps channel/value/eventType; unknown channel flagged', () => {
  const { ref, fields, unmapped } = buildOrderEventFields({
    order_ref: 'R100', erp_order_id: 5, channel: 'offline', value: '39.9',
    currency: 'AED', delivered_date: '2024-08-25', event_type: 'DELIVERED',
  });
  assert.equal(ref, 'R100');
  assert.equal(fields.orderRef, 'R100');
  assert.equal(fields.channel, 'OFFLINE');
  assert.equal(fields.eventType, 'DELIVERED');
  assert.deepEqual(fields.value, { amountMicros: 39_900_000, currencyCode: 'AED' });
  assert.deepEqual(unmapped, []);

  const inShop = buildOrderEventFields({
    order_ref: 'R2', erp_order_id: 6, channel: 'IN_SHOP', value: null,
    currency: null, delivered_date: null, event_type: 'CREATED',
  });
  assert.equal(inShop.fields.channel, undefined);
  assert.deepEqual(inShop.unmapped, [{ field: 'channel', erpValue: 'IN_SHOP' }]);
});

test('incident maps known types; unknown types flagged; blank status = OPEN', () => {
  const missing = buildIncidentFields({
    erp_incident_id: 711, incident_type: 'missing', stage: 'packing',
    status: 'reported', quantity: 3, credited: true, order_ref: 'R9',
  });
  assert.equal(missing.fields.erpIncidentId, 711);
  assert.equal(missing.fields.category, 'MISSING_ITEM');
  assert.equal(missing.fields.status, 'OPEN');
  assert.equal(missing.fields.compensationAction, 'CREDIT_NEXT_ORDER');

  const extra = buildIncidentFields({
    erp_incident_id: 788, incident_type: 'extra', stage: 'packing',
    status: null, quantity: 1, credited: false, order_ref: null,
  });
  assert.equal(extra.fields.category, undefined);
  assert.equal(extra.fields.status, 'OPEN');
  assert.equal(extra.fields.compensationAction, 'NONE');
  assert.deepEqual(extra.unmapped, [{ field: 'category', erpValue: 'extra' }]);
});
