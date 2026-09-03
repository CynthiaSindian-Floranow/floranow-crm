import { LEAD_REGISTRATION_RESOLVED_COLUMNS } from '@/object-record/record-index/export/constants/LeadRegistrationResolvedColumns';
import { type RecordExportTemplate } from '@/object-record/record-index/export/types/RecordExportTemplate';
import { formatPointOfContactPhone } from '@/object-record/record-index/export/utils/formatPointOfContactPhone';

// Column order and header spelling are dictated by the marketplace's
// qualified-leads.xlsx -- do not reorder or rename. Rows are injected into that
// workbook itself, so a header that drifts from it lands under the wrong
// dropdown.
//
// Most of the 54 columns are deliberately empty: only what the CRM actually
// knows is filled, and a human completes the rest in Excel using the template's
// own pickers. Columns declared without a getValue are those blanks.
function blank(header: string) {
  return { header };
}

export const LEAD_REGISTRATION_EXPORT_TEMPLATE: RecordExportTemplate = {
  filename: 'qualified-leads.xlsx',
  recordGqlFields: {
    id: true,
    name: true,
    businessName: true,
    customerType: true,
    customerCategory: true,
    buyerSegment: true,
    billingCurrency: true,
    vatNumber: true,
    country: true,
    city: true,
    pointOfContact: {
      id: true,
      name: true,
      emails: true,
      phones: true,
    },
    owner: {
      id: true,
      name: true,
    },
  },
  columns: [
    {
      header: 'Email *',
      getValue: (record) => record.pointOfContact?.emails?.primaryEmail,
    },
    // The stored value already is the marketplace's vocabulary: RESELLER,
    // RETAIL, FOB, CIF.
    { header: 'Customer type *', getValue: (record) => record.customerType },
    {
      header: 'Contact name *',
      getValue: (record) =>
        [
          record.pointOfContact?.name?.firstName,
          record.pointOfContact?.name?.lastName,
        ]
          .filter((part) => typeof part === 'string' && part !== '')
          .join(' '),
    },
    { header: 'Business name *', getValue: (record) => record.businessName },
    {
      header: 'Phone number *',
      getValue: formatPointOfContactPhone,
    },
    blank('Arabic name'),
    { header: 'VAT number', getValue: (record) => record.vatNumber },
    blank('Commercial register'),
    // The operator fills this in after registration; re-importing the file reads
    // it back against the leadId in the last column.
    blank('Debtor number'),
    blank('ERP user reference id'),
    blank('Language'),
    blank('Statement type'),
    // Stored as the ISO code, which is what the Currencies list holds.
    { header: 'Currency *', getValue: (record) => record.billingCurrency },
    blank(LEAD_REGISTRATION_RESOLVED_COLUMNS.segment),
    blank('Sales channel'),
    blank('Incoterm'),
    blank('Delivery point kind'),
    blank('Order unit'),
    blank(LEAD_REGISTRATION_RESOLVED_COLUMNS.country),
    blank(LEAD_REGISTRATION_RESOLVED_COLUMNS.city),
    blank('Skip delivery window'),
    blank('Allow custom PO number'),
    blank('Can order after cutoff'),
    blank('Allow due invoices'),
    blank('Has trade access'),
    blank('Online payment disabled'),
    blank('Skip delivery charge'),
    blank('Order blocked'),
    blank('Online orders blocked'),
    blank('Internal'),
    blank('Company'),
    blank('Payment term'),
    blank('Credit limit'),
    blank('Bank account'),
    blank('Financial administration'),
    blank('Warehouse'),
    blank('Route'),
    blank('FM warehouse'),
    blank('Airport'),
    blank('Box label'),
    blank(LEAD_REGISTRATION_RESOLVED_COLUMNS.userCategory),
    {
      header: 'Account manager',
      getValue: (record) =>
        [record.owner?.name?.firstName, record.owner?.name?.lastName]
          .filter((part) => typeof part === 'string' && part !== '')
          .join(' '),
    },
    blank('Product mapper builder'),
    blank('Accessible warehouses'),
    blank('Accessible locations'),
    blank('Accessible internal stocks'),
    blank('Invoice template'),
    blank('Credit note template'),
    blank('Statement template'),
    blank('Ledger template'),
    blank('Payment receipt template'),
    blank('Creditable invoice template'),
    blank('Consignee country'),
    blank('Consignee region'),
    // Appended after the marketplace's own 54 columns so the template keeps its
    // exact shape. This is what lets Import after registration match a debtor
    // number back to the lead it came from.
    { header: 'leadId', getValue: (record) => record.id },
  ],
};
