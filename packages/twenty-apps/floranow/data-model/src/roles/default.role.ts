import { defineApplicationRole } from 'twenty-sdk/define';

// Every app must declare a default role — it is the identity the app's own code
// would run as. This app is data model only (no logic functions), so the role
// deliberately grants nothing. It does not affect what your users can see;
// people keep the workspace roles they already have.
export const DEFAULT_ROLE_UNIVERSAL_IDENTIFIER =
  'fabd478a-4a26-429e-94ea-f12bd3f5e085';

export default defineApplicationRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Floranow Data Model',
  description: 'Unprivileged default role for the data model app',
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canBeAssignedToAgents: false,
  canBeAssignedToUsers: false,
  canBeAssignedToApiKeys: false,
});
