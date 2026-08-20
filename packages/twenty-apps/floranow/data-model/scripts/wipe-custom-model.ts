// One-time cutover helper: removes the hand-built custom data model from a
// target instance so the generated app can take ownership of it.
//
// Run this against PROD once, before the first `app:install`. After that you
// never need it again — the app's own diff handles every later change.
//
//   TWENTY_TARGET_URL=https://crm.example.com \
//   TWENTY_TARGET_API_KEY=... \
//   yarn model:wipe            # dry run — prints the plan, changes nothing
//
//   ... --apply --yes          # actually delete
//
// It goes through the metadata GraphQL API, not SQL, so every deletion runs the
// server's normal migration path: tables and columns are dropped properly and
// dependent views, layouts and relations are cleaned up with them.
//
// THIS DELETES DATA. Dropping an object drops its table and every record in it.
// Take a database backup first.

type ObjectSummary = {
  id: string;
  nameSingular: string;
  labelSingular: string;
  applicationId: string;
  isCustom: boolean;
  fieldsList: {
    id: string;
    name: string;
    label: string;
    applicationId: string;
  }[];
};

const parseArguments = () => {
  const argv = process.argv.slice(2);

  return {
    apply: argv.includes('--apply'),
    yes: argv.includes('--yes'),
  };
};

const request = async <T>({
  url,
  apiKey,
  endpoint,
  query,
  variables,
}: {
  url: string;
  apiKey: string;
  endpoint: 'graphql' | 'metadata';
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> => {
  const response = await fetch(`${url.replace(/\/$/, '')}/${endpoint}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(
      `${endpoint} request failed: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (body.errors && body.errors.length > 0) {
    throw new Error(
      `${endpoint} error: ${body.errors.map((error) => error.message).join('; ')}`,
    );
  }

  if (!body.data) {
    throw new Error(`${endpoint} returned no data`);
  }

  return body.data;
};

const main = async () => {
  const { apply, yes } = parseArguments();

  const url = process.env.TWENTY_TARGET_URL;
  const apiKey = process.env.TWENTY_TARGET_API_KEY;

  if (!url || !apiKey) {
    throw new Error(
      'Set TWENTY_TARGET_URL and TWENTY_TARGET_API_KEY to the instance you want to wipe.',
    );
  }

  if (apply && !yes) {
    throw new Error(
      'Refusing to delete without --yes. Run the dry run first, read the plan, then add --yes.',
    );
  }

  const { currentWorkspace } = await request<{
    currentWorkspace: {
      id: string;
      displayName: string;
      workspaceCustomApplicationId: string;
    };
  }>({
    url,
    apiKey,
    endpoint: 'graphql',
    query: `query { currentWorkspace { id displayName workspaceCustomApplicationId } }`,
  });

  const customApplicationId = currentWorkspace.workspaceCustomApplicationId;

  console.log(
    `Target: ${url} — workspace "${currentWorkspace.displayName}" (${currentWorkspace.id})`,
  );
  console.log(apply ? 'Mode:   APPLY\n' : 'Mode:   dry run (nothing will change)\n');

  const loadObjects = async () => {
    const data = await request<{
      objects: { edges: { node: ObjectSummary }[] };
    }>({
      url,
      apiKey,
      endpoint: 'metadata',
      query: `query {
        objects(paging: { first: 1000 }) {
          edges {
            node {
              id
              nameSingular
              labelSingular
              applicationId
              isCustom
              fieldsList { id name label applicationId }
            }
          }
        }
      }`,
    });

    return data.objects.edges.map((edge) => edge.node);
  };

  const objects = await loadObjects();

  const objectsToDelete = objects.filter(
    (object) => object.applicationId === customApplicationId,
  );
  const objectIdsToDelete = new Set(objectsToDelete.map((object) => object.id));

  // Custom fields living on objects that are staying — the columns added to
  // Company, Person, Opportunity and friends.
  const fieldsToDelete = objects
    .filter((object) => !objectIdsToDelete.has(object.id))
    .flatMap((object) =>
      object.fieldsList
        .filter((field) => field.applicationId === customApplicationId)
        .map((field) => ({ object, field })),
    );

  console.log(`Custom objects to delete: ${objectsToDelete.length}`);

  for (const object of objectsToDelete) {
    console.log(
      `  - ${object.nameSingular} (${object.labelSingular}) — drops its table and all records`,
    );
  }

  console.log(
    `\nCustom fields on standard objects to delete: ${fieldsToDelete.length}`,
  );

  for (const { object, field } of fieldsToDelete) {
    console.log(`  - ${object.nameSingular}.${field.name} (${field.label})`);
  }

  if (objectsToDelete.length === 0 && fieldsToDelete.length === 0) {
    console.log('\nNothing to do — this instance has no hand-built custom model.');

    return;
  }

  if (!apply) {
    console.log(
      '\nDry run only. Re-run with --apply --yes to delete the above.',
    );

    return;
  }

  // Objects first: dropping an object also removes the relation fields it owns
  // on standard objects, so the leftover field list shrinks on its own.
  for (const object of objectsToDelete) {
    console.log(`Deleting object ${object.nameSingular}...`);

    await request({
      url,
      apiKey,
      endpoint: 'metadata',
      query: `mutation ($input: DeleteOneObjectInput!) {
        deleteOneObject(input: $input) { id }
      }`,
      variables: { input: { id: object.id } },
    });
  }

  const remainingObjects = await loadObjects();
  const remainingObjectIds = new Set(
    remainingObjects
      .filter((object) => object.applicationId === customApplicationId)
      .map((object) => object.id),
  );

  const remainingFields = remainingObjects
    .filter((object) => !remainingObjectIds.has(object.id))
    .flatMap((object) =>
      object.fieldsList
        .filter((field) => field.applicationId === customApplicationId)
        .map((field) => ({ object, field })),
    );

  for (const { object, field } of remainingFields) {
    console.log(`Deleting field ${object.nameSingular}.${field.name}...`);

    await request({
      url,
      apiKey,
      endpoint: 'metadata',
      query: `mutation ($input: DeleteOneFieldInput!) {
        deleteOneField(input: $input) { id }
      }`,
      variables: { input: { id: field.id } },
    });
  }

  console.log('\nDone. Run this script again to confirm it reports nothing to do.');
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
