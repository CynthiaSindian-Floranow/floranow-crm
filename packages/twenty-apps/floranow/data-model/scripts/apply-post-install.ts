// Applies the parts of the model that a manifest cannot carry. Run it after
// every `app:install`.
//
//   1. Renames of built-in objects and fields — showing Opportunity as "Lead",
//      for instance. These live as standardOverrides on entities the app does
//      not own, so they are applied with updateOneObject / updateOneField.
//   2. Record page sections. There is no defineViewFieldGroup, and
//      createCoreViewFieldGroup hides universalIdentifier from the schema, but
//      upsertFieldsWidget takes a caller-chosen group id plus the fields that
//      belong in each group, so the structure can be rebuilt exactly.
//
//   TWENTY_TARGET_URL=https://crm.floranow.com \
//   TWENTY_TARGET_API_KEY=... \
//   yarn model:post-install            # dry run — prints the plan
//   yarn model:post-install --apply
//
// Idempotent: group ids come from dev's identifiers, so re-running converges
// rather than duplicating. Note that upsertFieldsWidget REPLACES every group on
// a widget, which is why src/prerequisites/view-field-groups.json carries the
// complete structure rather than only the missing sections.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type SectionPlan = {
  objectUniversalIdentifier: string;
  objectName: string;
  viewName: string;
  groups: {
    id: string;
    name: string;
    position: number;
    isVisible: boolean;
    fields: {
      fieldUniversalIdentifier: string;
      isVisible: boolean;
      position: number;
    }[];
  }[];
};

const request = async <T>({
  url,
  apiKey,
  query,
  variables,
}: {
  url: string;
  apiKey: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> => {
  const response = await fetch(`${url.replace(/\/$/, '')}/metadata`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (body.errors && body.errors.length > 0) {
    throw new Error(body.errors.map((error) => error.message).join('; '));
  }

  if (!body.data) {
    throw new Error(`metadata returned no data (HTTP ${response.status})`);
  }

  return body.data;
};

const main = async () => {
  const apply = process.argv.includes('--apply');
  const url = process.env.TWENTY_TARGET_URL;
  const apiKey = process.env.TWENTY_TARGET_API_KEY;

  if (!url || !apiKey) {
    throw new Error('Set TWENTY_TARGET_URL and TWENTY_TARGET_API_KEY.');
  }

  const plans = JSON.parse(
    readFileSync(
      join(__dirname, '..', 'src', 'prerequisites', 'view-field-groups.json'),
      'utf-8',
    ),
  ) as SectionPlan[];

  const overridePlans = (() => {
    try {
      return JSON.parse(
        readFileSync(
          join(__dirname, '..', 'src', 'prerequisites', 'standard-overrides.json'),
          'utf-8',
        ),
      ) as {
        kind: 'object' | 'field';
        objectUniversalIdentifier: string;
        objectName: string;
        fieldUniversalIdentifier?: string;
        fieldName?: string;
        overrides: Record<string, unknown>;
      }[];
    } catch {
      return [];
    }
  })();

  console.log(`Target: ${url}`);
  console.log(apply ? 'Mode:   APPLY\n' : 'Mode:   dry run\n');

  const objectData = await request<{
    objects: {
      edges: {
        node: {
          id: string;
          nameSingular: string;
          universalIdentifier: string;
          fieldsList: { id: string; universalIdentifier: string }[];
        };
      }[];
    };
  }>({
    url,
    apiKey,
    query: `query {
      objects(paging: { first: 500 }) {
        edges { node { id nameSingular universalIdentifier fieldsList { id universalIdentifier } } }
      }
    }`,
  });

  const objects = objectData.objects.edges.map((edge) => edge.node);
  const objectByUid = new Map(
    objects.map((object) => [object.universalIdentifier, object]),
  );
  const fieldIdByUid = new Map(
    objects.flatMap((object) =>
      object.fieldsList.map(
        (field) => [field.universalIdentifier, field.id] as const,
      ),
    ),
  );

  const layoutData = await request<{
    getPageLayouts: {
      id: string;
      name: string;
      type: string;
      objectMetadataId: string | null;
    }[];
  }>({
    url,
    apiKey,
    query: `query { getPageLayouts { id name type objectMetadataId } }`,
  });

  const allViews = await request<{
    getViews: { id: string; type: string; objectMetadataId: string }[];
  }>({
    url,
    apiKey,
    query: `query { getViews { id type objectMetadataId } }`,
  });

  // ---- 1. renames of built-in objects and fields

  if (overridePlans.length > 0) {
    console.log('Renames of built-in entities:');
  }

  for (const plan of overridePlans) {
    const targetObject = objectByUid.get(plan.objectUniversalIdentifier);

    if (!targetObject) {
      console.log(`  SKIP ${plan.objectName}: not on target`);
      continue;
    }

    const label =
      plan.kind === 'object'
        ? plan.objectName
        : `${plan.objectName}.${plan.fieldName}`;

    console.log(`  ${label} -> ${JSON.stringify(plan.overrides)}`);

    if (!apply) {
      continue;
    }

    if (plan.kind === 'object') {
      await request({
        url,
        apiKey,
        query: `mutation ($input: UpdateOneObjectInput!) {
          updateOneObject(input: $input) { id }
        }`,
        variables: {
          input: { id: targetObject.id, update: plan.overrides },
        },
      });
    } else {
      const fieldId = fieldIdByUid.get(plan.fieldUniversalIdentifier ?? '');

      if (!fieldId) {
        console.log(`  SKIP ${label}: field not on target`);
        continue;
      }

      await request({
        url,
        apiKey,
        query: `mutation ($input: UpdateOneFieldMetadataInput!) {
          updateOneField(input: $input) { id }
        }`,
        variables: { input: { id: fieldId, update: plan.overrides } },
      });
    }
  }

  if (overridePlans.length > 0) {
    console.log('');
  }

  // ---- 2. record page sections

  console.log('Record page sections:');

  let applied = 0;
  let skipped = 0;

  for (const plan of plans) {
    const targetObject = objectByUid.get(plan.objectUniversalIdentifier);

    if (!targetObject) {
      console.log(`  SKIP ${plan.objectName}: object not on target`);
      skipped += 1;
      continue;
    }

    const layout = layoutData.getPageLayouts.find(
      (candidate) =>
        candidate.type === 'RECORD_PAGE' &&
        candidate.objectMetadataId === targetObject.id,
    );

    if (!layout) {
      console.log(`  SKIP ${plan.objectName}: no record page layout on target`);
      skipped += 1;
      continue;
    }

    const tabs = await request<{
      getPageLayoutTabs: { id: string; title: string }[];
    }>({
      url,
      apiKey,
      query: `query { getPageLayoutTabs(pageLayoutId: "${layout.id}") { id title } }`,
    });

    let widgetId: string | undefined;

    // The widget's configuration is a GraphQL union, so rather than select
    // through it, find the record page's FIELDS_WIDGET view by object.
    const widgetViewId = allViews.getViews.find(
      (view) =>
        view.type === 'FIELDS_WIDGET' &&
        view.objectMetadataId === targetObject.id,
    )?.id;

    for (const tab of tabs.getPageLayoutTabs) {
      const widgets = await request<{
        getPageLayoutWidgets: { id: string; type: string }[];
      }>({
        url,
        apiKey,
        query: `query { getPageLayoutWidgets(pageLayoutTabId: "${tab.id}") { id type } }`,
      });

      const fieldsWidget = widgets.getPageLayoutWidgets.find(
        (widget) => widget.type === 'FIELDS',
      );

      if (fieldsWidget) {
        widgetId = fieldsWidget.id;
        break;
      }
    }

    if (!widgetId) {
      console.log(`  SKIP ${plan.objectName}: no FIELDS widget on target`);
      skipped += 1;
      continue;
    }

    // The upsert matches groups by id, and the target's own groups were created
    // with ids of their own. Reuse the target's id whenever a section of the
    // same name is already there, so standard sections are updated in place
    // instead of colliding with a duplicate.
    const existingGroupIdByName = new Map<string, string>();

    if (widgetViewId) {
      const existing = await request<{
        getViewFieldGroups: { id: string; name: string | null }[];
      }>({
        url,
        apiKey,
        query: `query { getViewFieldGroups(viewId: "${widgetViewId}") { id name } }`,
      });

      for (const group of existing.getViewFieldGroups) {
        if (group.name) {
          existingGroupIdByName.set(group.name, group.id);
        }
      }
    }

    const groups = plan.groups.map((group) => ({
      id: existingGroupIdByName.get(group.name) ?? group.id,
      name: group.name,
      position: group.position,
      isVisible: group.isVisible,
      fields: group.fields
        .map((field) => ({
          fieldMetadataId: fieldIdByUid.get(field.fieldUniversalIdentifier),
          isVisible: field.isVisible,
          position: field.position,
        }))
        .filter(
          (
            field,
          ): field is {
            fieldMetadataId: string;
            isVisible: boolean;
            position: number;
          } => field.fieldMetadataId !== undefined,
        ),
    }));

    const droppedFields = plan.groups.reduce(
      (total, group) =>
        total +
        group.fields.filter(
          (field) => !fieldIdByUid.has(field.fieldUniversalIdentifier),
        ).length,
      0,
    );

    const fieldCount = groups.reduce(
      (total, group) => total + group.fields.length,
      0,
    );

    console.log(
      `  ${plan.objectName.padEnd(16)} ${groups.length} section(s), ${fieldCount} field(s)` +
        (droppedFields > 0
          ? ` — ${droppedFields} field(s) not on target, omitted`
          : ''),
    );

    for (const group of groups) {
      console.log(`      ${group.name} (${group.fields.length})`);
    }

    if (!apply) {
      continue;
    }

    await request({
      url,
      apiKey,
      query: `mutation ($input: UpsertFieldsWidgetInput!) {
        upsertFieldsWidget(input: $input) { id }
      }`,
      variables: { input: { widgetId, groups } },
    });

    applied += 1;
  }

  console.log('');

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write these sections.');

    return;
  }

  console.log(`Applied ${applied} view(s), skipped ${skipped}.`);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
