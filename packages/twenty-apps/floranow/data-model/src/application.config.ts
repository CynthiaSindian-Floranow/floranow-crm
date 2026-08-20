import { defineApplication } from 'twenty-sdk/define';

// This identifier is what ties the deployed app to its metadata in every
// workspace it is installed on. Never change it — changing it makes the server
// treat the next deploy as a brand new app and orphan everything it owns.
export const APPLICATION_UNIVERSAL_IDENTIFIER =
  'c4917984-2a18-42f8-928c-7861f1ba657c';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: 'Floranow Data Model',
  description:
    'Custom objects, fields, views and layouts for the Floranow CRM, generated from the dev workspace by `yarn model:pull`.',
});
