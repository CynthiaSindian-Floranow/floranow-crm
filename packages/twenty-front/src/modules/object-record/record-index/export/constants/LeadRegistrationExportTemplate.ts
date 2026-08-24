import { type RecordExportTemplate } from '@/object-record/record-index/export/types/RecordExportTemplate';
import { formatPointOfContactPhone } from '@/object-record/record-index/export/utils/formatPointOfContactPhone';

// Column order and header spelling are dictated by the marketplace's
// customers-template.csv importer -- do not reorder or rename.
export const LEAD_REGISTRATION_EXPORT_TEMPLATE: RecordExportTemplate = {
  filename: 'customers-template.csv',
  recordGqlFields: {
    id: true,
    name: true,
    businessName: true,
    customerType: true,
    billingCurrency: true,
    country: true,
    city: true,
    state: true,
    pointOfContact: {
      id: true,
      emails: true,
      phones: true,
    },
  },
  columns: [
    {
      header: 'email',
      getValue: (record) => record.pointOfContact?.emails?.primaryEmail,
    },
    { header: 'customerType', getValue: (record) => record.customerType },
    // Named "currency" here because the importer expects that header; the CRM
    // field is billingCurrency since "currency" is a reserved field name.
    { header: 'currency', getValue: (record) => record.billingCurrency },
    { header: 'name', getValue: (record) => record.name },
    { header: 'businessName', getValue: (record) => record.businessName },
    {
      header: 'phoneNumber',
      getValue: formatPointOfContactPhone,
      isPreSanitized: true,
    },
    { header: 'segmentId' },
    { header: 'salesChannelId' },
    { header: 'country', getValue: (record) => record.country },
    { header: 'city', getValue: (record) => record.city },
    { header: 'state', getValue: (record) => record.state },
    // Appended after the marketplace's own columns so the first eleven stay
    // byte-identical to customers-template.csv. These two carry the round trip:
    // leadId identifies the record on the way back, and debtorNumber is the
    // empty cell the operator fills in once the customer is registered.
    { header: 'leadId', getValue: (record) => record.id },
    { header: 'debtorNumber' },
  ],
};
