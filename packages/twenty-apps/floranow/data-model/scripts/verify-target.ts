// Checks that a target instance actually got what the manifest describes.
//
// Run it after `app:install` to turn "did it work?" into a definite answer
// instead of clicking around the UI.
//
//   yarn twenty dev:build .          # produces .twenty/output/manifest.json
//   TWENTY_TARGET_URL=https://crm.floranow.com \
//   TWENTY_TARGET_API_KEY=... \
//   yarn model:verify
//
// Exits non-zero if anything in the manifest is missing on the target, so it
// can be used as a CI gate after deploying.
//
// Objects and fields are matched on `universalIdentifier`, which is the thing
// that actually has to line up. Views are matched on name + object, because the
// view read DTO does not expose universalIdentifier over GraphQL.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type ManifestField = {
  universalIdentifier: string;
  name: string;
  type?: string;
  objectUniversalIdentifier?: string;
};

type Manifest = {
  application: { displayName: string; universalIdentifier: string };
  objects: {
    universalIdentifier: string;
    nameSingular: string;
    fields: ManifestField[];
  }[];
  fields: ManifestField[];
  views: { name: string; objectUniversalIdentifier: string }[];
  pageLayouts: {
    universalIdentifier: string;
    name: string;
    objectUniversalIdentifier?: string;
    tabs?: {
      universalIdentifier: string;
      title: string;
      widgets?: { universalIdentifier: string; title: string; type: string }[];
    }[];
  }[];
  viewFields: { universalIdentifier: string; viewUniversalIdentifier: string }[];
  navigationMenuItems: { universalIdentifier: string }[];
  indexes: { universalIdentifier: string }[];
};

type TargetObject = {
  id: string;
  universalIdentifier: string;
  nameSingular: string;
  labelSingular: string;
  labelPlural: string;
  applicationId: string;
  fieldsList: {
    id: string;
    name: string;
    universalIdentifier: string;
    applicationId: string;
  }[];
};

const request = async <T>({
  url,
  apiKey,
  endpoint,
  query,
}: {
  url: string;
  apiKey: string;
  endpoint: 'graphql' | 'metadata';
  query: string;
}): Promise<T> => {
  const response = await fetch(`${url.replace(/\/$/, '')}/${endpoint}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query }),
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
  const url = process.env.TWENTY_TARGET_URL;
  const apiKey = process.env.TWENTY_TARGET_API_KEY;

  if (!url || !apiKey) {
    throw new Error('Set TWENTY_TARGET_URL and TWENTY_TARGET_API_KEY.');
  }

  const manifestPath = join(
    __dirname,
    '..',
    '.twenty',
    'output',
    'manifest.json',
  );

  let manifest: Manifest;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Manifest;
  } catch {
    throw new Error(
      `Could not read ${manifestPath}. Run \`yarn twenty dev:build .\` first.`,
    );
  }

  console.log(`Verifying ${url} against "${manifest.application.displayName}"\n`);

  const objectData = await request<{
    objects: { edges: { node: TargetObject }[] };
  }>({
    url,
    apiKey,
    endpoint: 'metadata',
    query: `query {
      objects(paging: { first: 500 }) {
        edges {
          node {
            id universalIdentifier nameSingular labelSingular labelPlural applicationId
            fieldsList { id name universalIdentifier applicationId }
          }
        }
      }
    }`,
  });

  const targetObjects = objectData.objects.edges.map((edge) => edge.node);
  const targetObjectByUid = new Map(
    targetObjects.map((object) => [object.universalIdentifier, object]),
  );
  const targetFieldByUid = new Map(
    targetObjects.flatMap((object) =>
      object.fieldsList.map(
        (field) => [field.universalIdentifier, { object, field }] as const,
      ),
    ),
  );

  const problems: string[] = [];
  let checkedFields = 0;
  let skippedMorphFields = 0;

  // A morph relation is stored as one fieldMetadata row named after the morph
  // base (`target`), while the manifest declares one entry per arm
  // (`targetVisit`, `targetIncident`, ...). Comparing those by name reports
  // failures that are not real, so they are counted and skipped. The arms are
  // still verifiable through the workspace GraphQL schema.
  const isMorph = (field: ManifestField) => field.type === 'MORPH_RELATION';

  // Objects, and the fields declared inline on them.
  for (const manifestObject of manifest.objects) {
    const targetObject = targetObjectByUid.get(
      manifestObject.universalIdentifier,
    );

    if (!targetObject) {
      problems.push(
        `MISSING object "${manifestObject.nameSingular}" (${manifestObject.universalIdentifier})`,
      );
      continue;
    }

    if (targetObject.nameSingular !== manifestObject.nameSingular) {
      problems.push(
        `MISMATCH object ${manifestObject.universalIdentifier}: manifest says "${manifestObject.nameSingular}", target says "${targetObject.nameSingular}"`,
      );
    }

    for (const manifestField of manifestObject.fields) {
      if (isMorph(manifestField)) {
        skippedMorphFields += 1;
        continue;
      }

      checkedFields += 1;

      const found = targetFieldByUid.get(manifestField.universalIdentifier);

      if (!found) {
        problems.push(
          `MISSING field ${manifestObject.nameSingular}.${manifestField.name} (${manifestField.universalIdentifier})`,
        );
        continue;
      }

      if (found.field.name !== manifestField.name) {
        problems.push(
          `MISMATCH field ${manifestField.universalIdentifier}: manifest says "${manifestField.name}", target says "${found.field.name}"`,
        );
      }
    }
  }

  // Standalone fields — the ones this app adds to objects it does not own.
  for (const manifestField of manifest.fields) {
    if (isMorph(manifestField)) {
      skippedMorphFields += 1;
      continue;
    }

    checkedFields += 1;

    const found = targetFieldByUid.get(manifestField.universalIdentifier);

    if (!found) {
      problems.push(
        `MISSING field "${manifestField.name}" (${manifestField.universalIdentifier}) on a standard object`,
      );
      continue;
    }

    if (found.field.name !== manifestField.name) {
      problems.push(
        `MISMATCH field ${manifestField.universalIdentifier}: manifest says "${manifestField.name}", target says "${found.field.name}"`,
      );
    }
  }

  // Views, matched on name + object.
  const viewData = await request<{
    getViews: { id: string; name: string; objectMetadataId: string }[];
  }>({
    url,
    apiKey,
    endpoint: 'metadata',
    query: `query { getViews { id name objectMetadataId } }`,
  });

  const targetObjectById = new Map(
    targetObjects.map((object) => [object.id, object]),
  );

  const targetObjectByUniversalId = targetObjectByUid;

  for (const manifestView of manifest.views) {
    // View names may be templates the server interpolates on creation, e.g.
    // "All {objectLabelPlural}" becomes "All Visits".
    const owningObject = targetObjectByUniversalId.get(
      manifestView.objectUniversalIdentifier,
    );

    const expectedName = manifestView.name
      .replace('{objectLabelPlural}', owningObject?.labelPlural ?? '')
      .replace('{objectLabelSingular}', owningObject?.labelSingular ?? '');

    const matching = viewData.getViews.filter((view) => {
      const owner = targetObjectById.get(view.objectMetadataId);

      return (
        (view.name === manifestView.name || view.name === expectedName) &&
        owner?.universalIdentifier === manifestView.objectUniversalIdentifier
      );
    });

    if (matching.length === 0) {
      problems.push(`MISSING view "${manifestView.name}"`);
    }
  }

  // Page layouts, their tabs, and the widgets on each tab. This is what the
  // record page actually renders, so a layout that installs without widgets
  // looks like an empty page to the user.
  const layoutData = await request<{
    getPageLayouts: {
      id: string;
      name: string;
      universalIdentifier: string;
      objectMetadataId: string | null;
    }[];
  }>({
    url,
    apiKey,
    endpoint: 'metadata',
    query: `query { getPageLayouts { id name universalIdentifier objectMetadataId } }`,
  });

  const targetLayoutByUid = new Map(
    layoutData.getPageLayouts.map((layout) => [
      layout.universalIdentifier,
      layout,
    ]),
  );

  let checkedTabs = 0;
  let checkedWidgets = 0;

  for (const manifestLayout of manifest.pageLayouts ?? []) {
    const targetLayout = targetLayoutByUid.get(
      manifestLayout.universalIdentifier,
    );

    if (!targetLayout) {
      problems.push(
        `MISSING page layout "${manifestLayout.name}" (${manifestLayout.universalIdentifier})`,
      );
      continue;
    }

    const tabData = await request<{
      getPageLayoutTabs: { id: string; title: string }[];
    }>({
      url,
      apiKey,
      endpoint: 'metadata',
      // PageLayoutTab and PageLayoutWidget do not expose universalIdentifier
      // over GraphQL, so tabs match on title and widgets on title + type.
      query: `query { getPageLayoutTabs(pageLayoutId: "${targetLayout.id}") { id title } }`,
    });

    const targetTabByTitle = new Map(
      tabData.getPageLayoutTabs.map((tab) => [tab.title, tab]),
    );

    for (const manifestTab of manifestLayout.tabs ?? []) {
      checkedTabs += 1;

      const targetTab = targetTabByTitle.get(manifestTab.title);

      if (!targetTab) {
        problems.push(
          `MISSING tab "${manifestTab.title}" on layout "${manifestLayout.name}"`,
        );
        continue;
      }

      const widgetData = await request<{
        getPageLayoutWidgets: { id: string; title: string; type: string }[];
      }>({
        url,
        apiKey,
        endpoint: 'metadata',
        query: `query { getPageLayoutWidgets(pageLayoutTabId: "${targetTab.id}") { id title type } }`,
      });

      const targetWidgetKeys = new Set(
        widgetData.getPageLayoutWidgets.map(
          (widget) => `${widget.title}|${widget.type}`,
        ),
      );

      for (const manifestWidget of manifestTab.widgets ?? []) {
        checkedWidgets += 1;

        if (
          !targetWidgetKeys.has(`${manifestWidget.title}|${manifestWidget.type}`)
        ) {
          problems.push(
            `MISSING widget "${manifestWidget.title}" (${manifestWidget.type}) on tab "${manifestTab.title}" of "${manifestLayout.name}"`,
          );
        }
      }
    }
  }

  console.log(`objects checked        ${manifest.objects.length}`);
  console.log(`fields checked         ${checkedFields}`);
  console.log(`views checked          ${manifest.views.length}`);
  console.log(`morph fields skipped   ${skippedMorphFields}`);
  console.log(`page layouts checked   ${(manifest.pageLayouts ?? []).length}`);
  console.log(`  tabs                 ${checkedTabs}`);
  console.log(`  widgets              ${checkedWidgets}`);

  // Things the app owns on the target that the manifest no longer describes.
  // Not a failure — the next install removes them — but worth surfacing.
  const manifestFieldUids = new Set([
    ...manifest.objects.flatMap((object) =>
      object.fields.map((field) => field.universalIdentifier),
    ),
    ...manifest.fields.map((field) => field.universalIdentifier),
  ]);
  const manifestObjectUids = new Set(
    manifest.objects.map((object) => object.universalIdentifier),
  );

  const appObjectIds = new Set(
    targetObjects
      .filter((object) => manifestObjectUids.has(object.universalIdentifier))
      .map((object) => object.applicationId),
  );

  const strays = targetObjects.flatMap((object) =>
    object.fieldsList
      .filter(
        (field) =>
          appObjectIds.has(field.applicationId) &&
          !manifestFieldUids.has(field.universalIdentifier),
      )
      .map((field) => `${object.nameSingular}.${field.name}`),
  );

  if (strays.length > 0) {
    console.log(
      `\nOwned by the app on the target but not in the manifest (${strays.length}):`,
    );

    for (const stray of strays.slice(0, 20)) {
      console.log(`  - ${stray}`);
    }
  }

  if (problems.length === 0) {
    console.log('\nTarget matches the manifest.');

    return;
  }

  console.log(`\n${problems.length} problem(s):`);

  for (const problem of problems) {
    console.log(`  - ${problem}`);
  }

  process.exit(1);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
