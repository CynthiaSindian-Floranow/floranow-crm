// Snapshots the custom data model of a live Twenty workspace into the `src/`
// folder of this app, as `define*()` source files.
//
// Run it against DEV. Commit the diff. Jenkins then installs the same commit on
// PROD, where the server diffs the manifest against what the app already owns
// and creates / updates / deletes only what changed.
//
//   TWENTY_DEV_DATABASE_URL=postgres://... yarn model:pull
//
// It reads from Postgres rather than the metadata GraphQL API because the view
// read DTO does not expose `universalIdentifier`, and that identifier is the
// whole point: it is what lets prod recognise a field as "the same field" as
// the one in dev instead of dropping and recreating it.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Client } from 'pg';

const SRC_DIR = join(__dirname, '..', 'src');

// Generated folders are wiped on every pull so that deleting something in dev
// shows up as a file deletion in the git diff.
const GENERATED_DIRS = [
  'objects',
  'fields',
  'views',
  'view-fields',
  'page-layouts',
  'navigation-menu-items',
  'indexes',
  'prerequisites',
];

// The SDK injects these four relations (and their reverse side on the standard
// objects) into every object in the manifest, unconditionally, with its own
// deterministic identifiers — see get-default-relation-object-fields.ts in
// twenty-sdk. Emitting them here would collide with the injected copies, so we
// skip both sides and let the SDK own them.
const SDK_INJECTED_RELATION_FIELD_NAMES = [
  'timelineActivities',
  'attachments',
  'noteTargets',
  'taskTargets',
];

const warnings: string[] = [];

const warn = (message: string) => {
  warnings.push(message);
};

// Only the built-in Twenty Standard app is allowed to use these names. An
// installed application is rejected with INVALID_FIELD_INPUT, so anything named
// after one of them cannot ship and is skipped here rather than failing the
// install. Read from the server source so the list cannot drift out of sync.
const RESERVED_NAMES_SOURCE = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'twenty-shared',
  'src',
  'metadata',
  'constants',
  'reserved-metadata-name-keywords.constant.ts',
);

const loadReservedNames = (): Set<string> => {
  try {
    const source = readFileSync(RESERVED_NAMES_SOURCE, 'utf-8');
    const names = [...source.matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)].map(
      (match) => match[1],
    );

    if (names.length === 0) {
      throw new Error('no names parsed');
    }

    return new Set(names);
  } catch {
    warn(
      `Could not read the reserved name list from ${RESERVED_NAMES_SOURCE}. ` +
        'Reserved-name collisions will not be caught here and will surface as install errors instead.',
    );

    return new Set();
  }
};

// `core."indexFieldMetadata"` has no universalIdentifier column, but the
// manifest requires one for every syncable entity. Derive it deterministically
// from the index and the field so that the same index field always resolves to
// the same identifier on every pull and on every instance.
const INDEX_FIELD_NAMESPACE = 'b1f2b0f6-6a2f-4d9c-9b0e-1d3a5c7e9f21';

const deterministicUuid = (namespace: string, name: string) => {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1')
    .update(Buffer.concat([namespaceBytes, Buffer.from(name, 'utf-8')]))
    .digest();

  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.subarray(0, 16).toString('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
};

// ---------------------------------------------------------------- source model

type ObjectRow = {
  id: string;
  universalIdentifier: string;
  applicationId: string;
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  description: string | null;
  icon: string | null;
  isSearchable: boolean;
  isUICreatable: boolean;
  isUIEditable: boolean;
  isActive: boolean;
  labelIdentifierFieldMetadataId: string | null;
  standardOverrides: Record<string, unknown> | null;
};

type FieldRow = {
  id: string;
  universalIdentifier: string;
  applicationId: string;
  objectMetadataId: string;
  type: string;
  name: string;
  label: string;
  description: string | null;
  icon: string | null;
  defaultValue: unknown;
  options: unknown;
  settings: Record<string, unknown> | null;
  isNullable: boolean;
  isUIEditable: boolean;
  isActive: boolean;
  relationTargetFieldMetadataId: string | null;
  relationTargetObjectMetadataId: string | null;
  morphId: string | null;
  standardOverrides: Record<string, unknown> | null;
};

type ViewRow = {
  id: string;
  universalIdentifier: string;
  name: string;
  objectMetadataId: string;
  type: string | null;
  key: string | null;
  icon: string | null;
  position: number | null;
  isCompact: boolean | null;
  visibility: string | null;
  openRecordIn: string | null;
  mainGroupByFieldMetadataId: string | null;
  shouldHideEmptyGroups: boolean | null;
  kanbanAggregateOperation: string | null;
  kanbanAggregateOperationFieldMetadataId: string | null;
  calendarLayout: string | null;
  calendarFieldMetadataId: string | null;
};

// --------------------------------------------------------------- code emission

class Raw {
  constructor(readonly code: string) {}
}

const raw = (code: string) => new Raw(code);

// String enums in twenty-shared use identical keys and values, so `Enum.VALUE`
// is a safe reference. Anything that is not a plain SCREAMING_SNAKE identifier
// is emitted as a string literal and reported, so typecheck catches it rather
// than us emitting broken syntax.
const enumRef = (
  enumName: string,
  value: string | null | undefined,
  context: string,
): Raw | string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (!/^[A-Z][A-Z0-9_]*$/.test(value)) {
    warn(
      `${context}: "${value}" is not a valid ${enumName} member name — emitted as a string literal, check it typechecks`,
    );

    return value;
  }

  return raw(`${enumName}.${value}`);
};

const isPlainIdentifier = (key: string) =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);

const serialize = (value: unknown, depth = 0): string => {
  const pad = '  '.repeat(depth);
  const padInner = '  '.repeat(depth + 1);

  if (value instanceof Raw) {
    return value.code;
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }

    const items = value
      .map((item) => `${padInner}${serialize(item, depth + 1)}`)
      .join(',\n');

    return `[\n${items}\n${pad}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined,
    );

    if (entries.length === 0) {
      return '{}';
    }

    const body = entries
      .map(
        ([key, entryValue]) =>
          `${padInner}${isPlainIdentifier(key) ? key : JSON.stringify(key)}: ${serialize(entryValue, depth + 1)}`,
      )
      .join(',\n');

    return `{\n${body}\n${pad}}`;
  }

  throw new Error(`Cannot serialize value of type ${typeof value}`);
};

const KNOWN_SDK_IMPORTS = [
  'AggregateOperations',
  'FieldType',
  'NavigationMenuItemType',
  'OnDeleteAction',
  'PageLayoutTabLayoutMode',
  'RelationType',
  'ViewCalendarLayout',
  'ViewFilterGroupLogicalOperator',
  'ViewFilterOperand',
  'ViewKey',
  'ViewOpenRecordIn',
  'ViewSortDirection',
  'ViewType',
  'ViewVisibility',
];

const renderFile = ({
  defineFunction,
  body,
  constants = [],
}: {
  defineFunction: string;
  body: string;
  constants?: { name: string; value: string }[];
}): string => {
  const used = KNOWN_SDK_IMPORTS.filter((name) =>
    new RegExp(`\\b${name}\\.`).test(body),
  );

  const imports = [defineFunction, ...used].sort();

  const constantLines = constants
    .map(({ name, value }) => `export const ${name} = ${JSON.stringify(value)};`)
    .join('\n');

  return [
    '// AUTO-GENERATED by `yarn model:pull` from the dev workspace.',
    '// Do not edit by hand — your changes will be overwritten on the next pull.',
    '',
    `import { ${imports.join(', ')} } from 'twenty-sdk/define';`,
    '',
    constantLines ? `${constantLines}\n` : '',
    `export default ${defineFunction}(${body});`,
    '',
  ]
    .filter((line, index, all) => !(line === '' && all[index - 1] === ''))
    .join('\n');
};

// ------------------------------------------------------------------- filenames

const toKebabCase = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const toScreamingSnakeCase = (value: string) =>
  toKebabCase(value).replace(/-/g, '_').toUpperCase();

const uniqueFileNames = new Set<string>();

const claimFileName = (directory: string, base: string, suffix: string) => {
  let candidate = `${base}${suffix}`;
  let counter = 2;

  while (uniqueFileNames.has(`${directory}/${candidate}`)) {
    candidate = `${base}-${counter}${suffix}`;
    counter += 1;
  }

  uniqueFileNames.add(`${directory}/${candidate}`);

  return join(SRC_DIR, directory, candidate);
};

// ------------------------------------------------------------------------ main

const main = async () => {
  const connectionString = process.env.TWENTY_DEV_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'TWENTY_DEV_DATABASE_URL is not set. Point it at the dev database (a read-only user is enough).',
    );
  }

  const client = new Client({ connectionString });

  await client.connect();

  try {
    const workspaceId = process.env.TWENTY_WORKSPACE_ID;

    const workspaces = await client.query<{
      id: string;
      displayName: string;
      workspaceCustomApplicationId: string;
    }>(
      workspaceId
        ? 'select id, "displayName", "workspaceCustomApplicationId" from core.workspace where id = $1'
        : 'select id, "displayName", "workspaceCustomApplicationId" from core.workspace',
      workspaceId ? [workspaceId] : [],
    );

    if (workspaces.rowCount === 0) {
      throw new Error('No workspace found.');
    }

    if (workspaces.rowCount !== null && workspaces.rowCount > 1) {
      throw new Error(
        `This instance has ${workspaces.rowCount} workspaces. Set TWENTY_WORKSPACE_ID to pick one.`,
      );
    }

    const workspace = workspaces.rows[0];
    const customApplicationId = workspace.workspaceCustomApplicationId;

    console.log(
      `Pulling custom model from workspace "${workspace.displayName}" (${workspace.id})`,
    );

    // Every object and field in the workspace, not just custom-owned ones:
    // custom fields hang off standard objects and custom views reference
    // standard fields, so we need the whole graph to resolve identifiers.
    const { rows: allObjects } = await client.query<ObjectRow>(
      `select id, "universalIdentifier", "applicationId", "nameSingular", "namePlural",
              "labelSingular", "labelPlural", description, icon, "isSearchable",
              "isUICreatable", "isUIEditable", "isActive", "labelIdentifierFieldMetadataId",
              "standardOverrides"
       from core."objectMetadata" where "workspaceId" = $1`,
      [workspace.id],
    );

    const { rows: allFields } = await client.query<FieldRow>(
      `select id, "universalIdentifier", "applicationId", "objectMetadataId", type, name, label,
              description, icon, "defaultValue", options, settings, "isNullable",
              "isUIEditable", "isActive", "relationTargetFieldMetadataId",
              "relationTargetObjectMetadataId", "morphId", "standardOverrides"
       from core."fieldMetadata" where "workspaceId" = $1`,
      [workspace.id],
    );

    const objectsById = new Map(allObjects.map((row) => [row.id, row]));
    const fieldsById = new Map(allFields.map((row) => [row.id, row]));

    const objectUid = (id: string | null, context: string) => {
      if (id === null) {
        return undefined;
      }

      const object = objectsById.get(id);

      if (!object) {
        throw new Error(`${context}: unknown objectMetadataId ${id}`);
      }

      return object.universalIdentifier;
    };

    const fieldUid = (id: string | null, context: string) => {
      if (id === null) {
        return undefined;
      }

      const field = fieldsById.get(id);

      if (!field) {
        throw new Error(`${context}: unknown fieldMetadataId ${id}`);
      }

      return field.universalIdentifier;
    };

    const objectComment = (id: string | null) => {
      const object = id === null ? undefined : objectsById.get(id);

      return object ? object.nameSingular : 'unknown';
    };

    const reservedNames = loadReservedNames();

    const customObjects = allObjects.filter(
      (row) => row.applicationId === customApplicationId,
    );
    const customObjectIds = new Set(customObjects.map((row) => row.id));

    const customFields = allFields
      .filter((row) => row.applicationId === customApplicationId)
      .filter((row) => {
        if (!reservedNames.has(row.name)) {
          return true;
        }

        warn(
          `Field "${objectComment(row.objectMetadataId)}.${row.name}" uses the reserved name "${row.name}" and cannot ship — an installed app may not use reserved names. ` +
            'It is skipped, so the target will not have this field. Rename it in dev to include it.',
        );

        return false;
      });

    for (const object of allObjects) {
      if (
        object.applicationId === customApplicationId &&
        (reservedNames.has(object.nameSingular) ||
          reservedNames.has(object.namePlural))
      ) {
        warn(
          `Object "${object.nameSingular}" uses a reserved name and cannot ship. Rename it in dev to include it.`,
        );
      }
    }

    // Both sides of the four relations the SDK injects for us.
    const sdkInjectedFieldIds = new Set<string>();

    for (const field of customFields) {
      if (
        SDK_INJECTED_RELATION_FIELD_NAMES.includes(field.name) &&
        customObjectIds.has(field.objectMetadataId)
      ) {
        sdkInjectedFieldIds.add(field.id);

        if (field.relationTargetFieldMetadataId !== null) {
          sdkInjectedFieldIds.add(field.relationTargetFieldMetadataId);
        }
      }
    }

    for (const field of allFields) {
      if (!field.isActive) {
        warn(
          `Field "${objectComment(field.objectMetadataId)}.${field.name}" is deactivated in dev; the manifest has no way to express that, so it will be active on prod.`,
        );
      }
    }

    for (const object of customObjects) {
      if (!object.isActive) {
        warn(
          `Object "${object.nameSingular}" is deactivated in dev; the manifest has no way to express that, so it will be active on prod.`,
        );
      }
    }

    // ------------------------------------------------------------- reset output

    for (const directory of GENERATED_DIRS) {
      rmSync(join(SRC_DIR, directory), { recursive: true, force: true });
      mkdirSync(join(SRC_DIR, directory), { recursive: true });
    }

    const written: string[] = [];

    const write = (path: string, contents: string) => {
      writeFileSync(path, contents, 'utf-8');
      written.push(path);
    };

    // ---------------------------------------------------------------- fields

    const buildFieldManifest = (field: FieldRow, includeObject: boolean) => {
      const isRelation =
        field.type === 'RELATION' || field.type === 'MORPH_RELATION';

      const settings = field.settings ? { ...field.settings } : undefined;

      if (settings && typeof settings.relationType === 'string') {
        settings.relationType = enumRef(
          'RelationType',
          settings.relationType,
          `${field.name}.settings.relationType`,
        );
      }

      if (settings && typeof settings.onDelete === 'string') {
        settings.onDelete = enumRef(
          'OnDeleteAction',
          settings.onDelete,
          `${field.name}.settings.onDelete`,
        );
      }

      return {
        universalIdentifier: field.universalIdentifier,
        ...(includeObject
          ? {
              objectUniversalIdentifier: raw(
                `${JSON.stringify(objectUid(field.objectMetadataId, field.name))} /* ${objectComment(field.objectMetadataId)} */`,
              ),
            }
          : {}),
        type: enumRef('FieldType', field.type, field.name),
        name: field.name,
        label: field.label,
        description: field.description ?? undefined,
        icon: field.icon ?? undefined,
        isNullable: field.isNullable,
        isUIEditable: field.isUIEditable === false ? false : undefined,
        defaultValue:
          field.defaultValue === null ? undefined : field.defaultValue,
        options: field.options === null ? undefined : field.options,
        ...(isRelation
          ? {
              relationTargetObjectMetadataUniversalIdentifier: raw(
                `${JSON.stringify(objectUid(field.relationTargetObjectMetadataId, field.name))} /* ${objectComment(field.relationTargetObjectMetadataId)} */`,
              ),
              relationTargetFieldMetadataUniversalIdentifier: fieldUid(
                field.relationTargetFieldMetadataId,
                field.name,
              ),
              morphId: field.morphId ?? undefined,
            }
          : {}),
        universalSettings: settings,
      };
    };

    // ---------------------------------------------------------------- objects

    for (const object of customObjects) {
      const inlineFields = customFields
        .filter(
          (field) =>
            field.objectMetadataId === object.id &&
            !sdkInjectedFieldIds.has(field.id),
        )
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((field) => buildFieldManifest(field, false));

      const labelIdentifierUid = fieldUid(
        object.labelIdentifierFieldMetadataId,
        `${object.nameSingular}.labelIdentifier`,
      );

      const constantName = `${toScreamingSnakeCase(object.nameSingular)}_OBJECT_UNIVERSAL_IDENTIFIER`;

      const manifest = {
        universalIdentifier: raw(constantName),
        nameSingular: object.nameSingular,
        namePlural: object.namePlural,
        labelSingular: object.labelSingular,
        labelPlural: object.labelPlural,
        description: object.description ?? undefined,
        icon: object.icon ?? undefined,
        isSearchable: object.isSearchable,
        isUICreatable: object.isUICreatable === false ? false : undefined,
        isUIEditable: object.isUIEditable === false ? false : undefined,
        labelIdentifierFieldMetadataUniversalIdentifier: labelIdentifierUid,
        fields: inlineFields,
      };

      write(
        claimFileName('objects', toKebabCase(object.nameSingular), '.object.ts'),
        renderFile({
          defineFunction: 'defineObject',
          body: serialize(manifest),
          constants: [
            { name: constantName, value: object.universalIdentifier },
          ],
        }),
      );
    }

    // Fields the custom app owns that live on objects it does not own — the
    // reverse side of relations, plus genuinely custom fields added to standard
    // objects like Company.
    const standaloneFields = customFields
      .filter(
        (field) =>
          !customObjectIds.has(field.objectMetadataId) &&
          !sdkInjectedFieldIds.has(field.id),
      )
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const field of standaloneFields) {
      const onObject = objectComment(field.objectMetadataId);

      write(
        claimFileName(
          'fields',
          `${toKebabCase(field.name)}-on-${toKebabCase(onObject)}`,
          '.field.ts',
        ),
        renderFile({
          defineFunction: 'defineField',
          body: serialize(buildFieldManifest(field, true)),
        }),
      );
    }

    // ------------------------------------------------------------------ views

    const { rows: views } = await client.query<ViewRow>(
      `select id, "universalIdentifier", name, "objectMetadataId", type, key, icon, position,
              "isCompact", visibility, "openRecordIn", "mainGroupByFieldMetadataId",
              "shouldHideEmptyGroups", "kanbanAggregateOperation",
              "kanbanAggregateOperationFieldMetadataId", "calendarLayout",
              "calendarFieldMetadataId"
       from core.view
       where "workspaceId" = $1 and "applicationId" = $2 and "deletedAt" is null`,
      [workspace.id, customApplicationId],
    );

    const queryViewChildren = async <T>(table: string, columns: string) => {
      const { rows } = await client.query<T & { viewId: string }>(
        `select "viewId", ${columns} from core."${table}"
         where "workspaceId" = $1 and "applicationId" = $2 and "deletedAt" is null`,
        [workspace.id, customApplicationId],
      );

      const byViewId = new Map<string, (T & { viewId: string })[]>();

      for (const row of rows) {
        const bucket = byViewId.get(row.viewId) ?? [];

        bucket.push(row);
        byViewId.set(row.viewId, bucket);
      }

      return byViewId;
    };

    // Two kinds of view field have to travel:
    //
    //  - ones this app owns, which is everything on the views it owns, and
    //  - ones that *place an app-owned field* on somebody else's view, even
    //    though the view field row itself belongs to the standard app.
    //
    // The second kind is what puts the custom Company fields on the Company
    // record page. Filtering on view field ownership alone silently drops them
    // and the target shows the fields nowhere.
    type ViewFieldRow = {
      viewId: string;
      universalIdentifier: string;
      fieldMetadataId: string;
      isVisible: boolean;
      size: number | null;
      position: number;
      aggregateOperation: string | null;
      viewFieldGroupId: string | null;
    };

    const { rows: viewFieldRows } = await client.query<ViewFieldRow>(
      `select vf."viewId", vf."universalIdentifier", vf."fieldMetadataId", vf."isVisible",
              vf.size, vf.position, vf."aggregateOperation", vf."viewFieldGroupId"
       from core."viewField" vf
       join core."fieldMetadata" f on f.id = vf."fieldMetadataId"
       where vf."workspaceId" = $1 and vf."deletedAt" is null
         and (vf."applicationId" = $2 or f."applicationId" = $2)`,
      [workspace.id, customApplicationId],
    );

    const viewFieldsByViewId = new Map<string, ViewFieldRow[]>();

    for (const row of viewFieldRows) {
      const bucket = viewFieldsByViewId.get(row.viewId) ?? [];

      bucket.push(row);
      viewFieldsByViewId.set(row.viewId, bucket);
    }

    const viewFilterGroupsByViewId = await queryViewChildren<{
      id: string;
      universalIdentifier: string;
      parentViewFilterGroupId: string | null;
      logicalOperator: string;
      positionInViewFilterGroup: number | null;
    }>(
      'viewFilterGroup',
      'id, "universalIdentifier", "parentViewFilterGroupId", "logicalOperator", "positionInViewFilterGroup"',
    );

    const viewFiltersByViewId = await queryViewChildren<{
      universalIdentifier: string;
      fieldMetadataId: string;
      operand: string;
      value: unknown;
      subFieldName: string | null;
      viewFilterGroupId: string | null;
      positionInViewFilterGroup: number | null;
    }>(
      'viewFilter',
      '"universalIdentifier", "fieldMetadataId", operand, value, "subFieldName", "viewFilterGroupId", "positionInViewFilterGroup"',
    );

    const viewSortsByViewId = await queryViewChildren<{
      universalIdentifier: string;
      fieldMetadataId: string;
      direction: string;
    }>('viewSort', '"universalIdentifier", "fieldMetadataId", direction');

    const viewGroupsByViewId = await queryViewChildren<{
      universalIdentifier: string;
      fieldValue: string;
      isVisible: boolean;
      position: number;
    }>('viewGroup', '"universalIdentifier", "fieldValue", "isVisible", position');

    const viewFieldGroupsByViewId = await queryViewChildren<{
      id: string;
      universalIdentifier: string;
      name: string | null;
      position: number;
      isVisible: boolean;
    }>(
      'viewFieldGroup',
      'id, "universalIdentifier", name, position, "isVisible"',
    );

    // Custom view fields can hang off views the app does not own — the extra
    // columns and record page fields added to standard objects like Company.
    // Those need every view and every field group in the workspace, not just
    // the app-owned ones, to resolve their references.
    const { rows: allViews } = await client.query<{
      id: string;
      universalIdentifier: string;
      name: string;
      objectMetadataId: string;
      applicationId: string;
    }>(
      `select id, "universalIdentifier", name, "objectMetadataId", "applicationId"
       from core.view where "workspaceId" = $1 and "deletedAt" is null`,
      [workspace.id],
    );

    const { rows: allViewFieldGroups } = await client.query<{
      id: string;
      universalIdentifier: string;
      name: string | null;
      position: number;
      isVisible: boolean;
      viewId: string;
      applicationId: string;
    }>(
      `select id, "universalIdentifier", name, position, "isVisible", "viewId", "applicationId"
       from core."viewFieldGroup" where "workspaceId" = $1 and "deletedAt" is null`,
      [workspace.id],
    );

    // Every view field of every view, regardless of ownership. Needed to
    // rebuild complete section structures: upsertFieldsWidget replaces all
    // groups on a widget, so each group must list all of its fields.
    const { rows: allViewFieldRows } = await client.query<{
      id: string;
      viewId: string;
      fieldMetadataId: string;
      isVisible: boolean;
      position: number;
      viewFieldGroupId: string | null;
    }>(
      `select id, "viewId", "fieldMetadataId", "isVisible", position, "viewFieldGroupId"
       from core."viewField" where "workspaceId" = $1 and "deletedAt" is null`,
      [workspace.id],
    );

    const allViewFieldRowsByViewId = new Map<
      string,
      typeof allViewFieldRows
    >();

    for (const row of allViewFieldRows) {
      const bucket = allViewFieldRowsByViewId.get(row.viewId) ?? [];

      bucket.push(row);
      allViewFieldRowsByViewId.set(row.viewId, bucket);
    }

    const allViewsById = new Map(allViews.map((view) => [view.id, view]));
    const allViewFieldGroupsById = new Map(
      allViewFieldGroups.map((group) => [group.id, group]),
    );
    const customViewIds = new Set(views.map((view) => view.id));

    const uidByRowId = new Map<string, string>();

    for (const group of allViewFieldGroups) {
      uidByRowId.set(group.id, group.universalIdentifier);
    }

    for (const groups of viewFilterGroupsByViewId.values()) {
      for (const group of groups) {
        uidByRowId.set(group.id, group.universalIdentifier);
      }
    }

    for (const view of views) {
      const context = `view "${view.name}"`;

      const manifest = {
        universalIdentifier: view.universalIdentifier,
        name: view.name,
        objectUniversalIdentifier: raw(
          `${JSON.stringify(objectUid(view.objectMetadataId, context))} /* ${objectComment(view.objectMetadataId)} */`,
        ),
        type: enumRef('ViewType', view.type, context),
        key: enumRef('ViewKey', view.key, context),
        icon: view.icon ?? undefined,
        position: view.position ?? undefined,
        isCompact: view.isCompact ?? undefined,
        visibility: enumRef('ViewVisibility', view.visibility, context),
        openRecordIn: enumRef('ViewOpenRecordIn', view.openRecordIn, context),
        mainGroupByFieldMetadataUniversalIdentifier: fieldUid(
          view.mainGroupByFieldMetadataId,
          context,
        ),
        shouldHideEmptyGroups: view.shouldHideEmptyGroups ?? undefined,
        kanbanAggregateOperation: enumRef(
          'AggregateOperations',
          view.kanbanAggregateOperation,
          context,
        ),
        kanbanAggregateOperationFieldMetadataUniversalIdentifier: fieldUid(
          view.kanbanAggregateOperationFieldMetadataId,
          context,
        ),
        calendarLayout: enumRef('ViewCalendarLayout', view.calendarLayout, context),
        calendarFieldMetadataUniversalIdentifier: fieldUid(
          view.calendarFieldMetadataId,
          context,
        ),
        fieldGroups: (viewFieldGroupsByViewId.get(view.id) ?? [])
          .sort((left, right) => left.position - right.position)
          .map((group) => ({
            universalIdentifier: group.universalIdentifier,
            name: group.name ?? undefined,
            position: group.position,
            isVisible: group.isVisible,
          })),
        fields: (viewFieldsByViewId.get(view.id) ?? [])
          .sort((left, right) => left.position - right.position)
          .map((viewField) => ({
            universalIdentifier: viewField.universalIdentifier,
            fieldMetadataUniversalIdentifier: fieldUid(
              viewField.fieldMetadataId,
              context,
            ),
            isVisible: viewField.isVisible,
            size: viewField.size ?? undefined,
            position: viewField.position,
            aggregateOperation: enumRef(
              'AggregateOperations',
              viewField.aggregateOperation,
              context,
            ),
            viewFieldGroupUniversalIdentifier:
              viewField.viewFieldGroupId === null
                ? undefined
                : uidByRowId.get(viewField.viewFieldGroupId),
          })),
        filterGroups: (viewFilterGroupsByViewId.get(view.id) ?? []).map(
          (group) => ({
            universalIdentifier: group.universalIdentifier,
            logicalOperator: enumRef(
              'ViewFilterGroupLogicalOperator',
              group.logicalOperator,
              context,
            ),
            parentViewFilterGroupUniversalIdentifier:
              group.parentViewFilterGroupId === null
                ? undefined
                : uidByRowId.get(group.parentViewFilterGroupId),
            positionInViewFilterGroup:
              group.positionInViewFilterGroup ?? undefined,
          }),
        ),
        filters: (viewFiltersByViewId.get(view.id) ?? []).map((filter) => ({
          universalIdentifier: filter.universalIdentifier,
          fieldMetadataUniversalIdentifier: fieldUid(
            filter.fieldMetadataId,
            context,
          ),
          operand: enumRef('ViewFilterOperand', filter.operand, context),
          value: filter.value,
          subFieldName: filter.subFieldName ?? undefined,
          viewFilterGroupUniversalIdentifier:
            filter.viewFilterGroupId === null
              ? undefined
              : uidByRowId.get(filter.viewFilterGroupId),
          positionInViewFilterGroup:
            filter.positionInViewFilterGroup ?? undefined,
        })),
        sorts: (viewSortsByViewId.get(view.id) ?? []).map((sort) => ({
          universalIdentifier: sort.universalIdentifier,
          fieldMetadataUniversalIdentifier: fieldUid(
            sort.fieldMetadataId,
            context,
          ),
          direction: enumRef('ViewSortDirection', sort.direction, context),
        })),
        groups: (viewGroupsByViewId.get(view.id) ?? [])
          .sort((left, right) => left.position - right.position)
          .map((group) => ({
            universalIdentifier: group.universalIdentifier,
            fieldValue: group.fieldValue,
            isVisible: group.isVisible,
            position: group.position,
          })),
      };

      for (const key of [
        'fieldGroups',
        'fields',
        'filterGroups',
        'filters',
        'sorts',
        'groups',
      ] as const) {
        if (manifest[key].length === 0) {
          delete (manifest as Record<string, unknown>)[key];
        }
      }

      write(
        claimFileName(
          'views',
          `${toKebabCase(objectComment(view.objectMetadataId))}-${toKebabCase(view.name)}`,
          '.view.ts',
        ),
        renderFile({ defineFunction: 'defineView', body: serialize(manifest) }),
      );
    }

    // ------------------------------------------------- view fields on foreign views

    // Record page sections on views this app does not own cannot ship at all:
    //
    //  - there is no standalone defineViewFieldGroup(); a group is only
    //    expressible nested inside a defineView() for a view the app owns, and
    //  - createCoreViewFieldGroup marks `universalIdentifier` @HideField(), so
    //    the API cannot create one with the identifier dev uses either.
    //
    // So we drop the group reference from these view fields rather than ship an
    // identifier that will not resolve on the target. The fields still install;
    // they just land ungrouped on the record page. Every dropped group is
    // recorded in src/prerequisites/view-field-groups.json.
    const unshippableFieldGroups: {
      universalIdentifier: string;
      name: string | null;
      position: number;
      isVisible: boolean;
      viewUniversalIdentifier: string;
      viewName: string;
    }[] = [];

    let standaloneViewFieldCount = 0;

    for (const [viewId, viewFields] of viewFieldsByViewId.entries()) {
      if (customViewIds.has(viewId)) {
        continue;
      }

      const targetView = allViewsById.get(viewId);

      if (!targetView) {
        throw new Error(`Custom view field points at unknown view ${viewId}`);
      }

      const viewLabel = `${objectComment(targetView.objectMetadataId)} / ${targetView.name}`;

      for (const viewField of viewFields.sort(
        (left, right) => left.position - right.position,
      )) {
        const group =
          viewField.viewFieldGroupId === null
            ? undefined
            : allViewFieldGroupsById.get(viewField.viewFieldGroupId);

        if (
          group &&
          !unshippableFieldGroups.some(
            (existing) =>
              existing.universalIdentifier === group.universalIdentifier,
          )
        ) {
          unshippableFieldGroups.push({
            universalIdentifier: group.universalIdentifier,
            name: group.name,
            position: group.position,
            isVisible: group.isVisible,
            viewUniversalIdentifier: targetView.universalIdentifier,
            viewName: viewLabel,
          });
        }

        const manifest = {
          universalIdentifier: viewField.universalIdentifier,
          viewUniversalIdentifier: raw(
            `${JSON.stringify(targetView.universalIdentifier)} /* ${viewLabel} */`,
          ),
          fieldMetadataUniversalIdentifier: fieldUid(
            viewField.fieldMetadataId,
            viewLabel,
          ),
          isVisible: viewField.isVisible,
          size: viewField.size ?? undefined,
          position: viewField.position,
          aggregateOperation: enumRef(
            'AggregateOperations',
            viewField.aggregateOperation,
            viewLabel,
          ),
          // Deliberately not shipped — see the comment above.
          viewFieldGroupUniversalIdentifier: undefined,
        };

        const fieldRow = fieldsById.get(viewField.fieldMetadataId);

        write(
          claimFileName(
            'view-fields',
            `${toKebabCase(fieldRow ? fieldRow.name : 'field')}-on-${toKebabCase(targetView.name)}`,
            '.view-field.ts',
          ),
          renderFile({
            defineFunction: 'defineViewField',
            body: serialize(manifest),
          }),
        );

        standaloneViewFieldCount += 1;
      }
    }

    // The sections themselves cannot ship in the manifest, but they can be
    // rebuilt on a target with the upsertFieldsWidget mutation, which accepts a
    // caller-chosen group id and the fields that belong in each group. Emit the
    // COMPLETE section structure of every affected view — that mutation
    // replaces all groups on a widget, so a partial list would delete the rest.
    const sectionPlans = allViews
      .filter((view) => !customViewIds.has(view.id))
      .map((view) => {
        const groups = allViewFieldGroups
          .filter((group) => group.viewId === view.id)
          .sort((left, right) => left.position - right.position);

        if (groups.length === 0) {
          return null;
        }

        const viewFields = allViewFieldRowsByViewId.get(view.id) ?? [];

        return {
          objectUniversalIdentifier: objectUid(
            view.objectMetadataId,
            `view "${view.name}"`,
          ),
          objectName: objectComment(view.objectMetadataId),
          viewName: view.name,
          groups: groups.map((group) => ({
            id: group.universalIdentifier,
            name: group.name ?? '',
            position: group.position,
            isVisible: group.isVisible,
            fields: viewFields
              .filter((viewField) => viewField.viewFieldGroupId === group.id)
              .sort((left, right) => left.position - right.position)
              .map((viewField) => ({
                fieldUniversalIdentifier: fieldUid(
                  viewField.fieldMetadataId,
                  `view "${view.name}"`,
                ),
                isVisible: viewField.isVisible,
                position: viewField.position,
              })),
          })),
        };
      })
      .filter((plan): plan is NonNullable<typeof plan> => plan !== null);

    if (sectionPlans.length > 0) {
      writeFileSync(
        join(SRC_DIR, 'prerequisites', 'view-field-groups.json'),
        `${JSON.stringify(sectionPlans, null, 2)}\n`,
        'utf-8',
      );

      const groupCount = sectionPlans.reduce(
        (total, plan) => total + plan.groups.length,
        0,
      );

      warn(
        `${groupCount} record page section(s) across ${sectionPlans.length} view(s) cannot ship in the manifest. ` +
          'Apply them with `yarn model:post-install` after installing — see README.',
      );
    }

    // Renaming a built-in object or field — Opportunity shown as "Lead", say —
    // is stored as standardOverrides on the standard entity. The app does not
    // own those entities so the manifest cannot carry the change; it is applied
    // to the target afterwards through updateOneObject / updateOneField.
    const overridePlans = [
      ...allObjects
        .filter((object) => object.standardOverrides !== null)
        .map((object) => ({
          kind: 'object' as const,
          objectUniversalIdentifier: object.universalIdentifier,
          objectName: object.nameSingular,
          fieldUniversalIdentifier: undefined,
          fieldName: undefined,
          overrides: object.standardOverrides,
        })),
      ...allFields
        .filter((field) => field.standardOverrides !== null)
        .map((field) => ({
          kind: 'field' as const,
          objectUniversalIdentifier: objectUid(
            field.objectMetadataId,
            `field ${field.name}`,
          ),
          objectName: objectComment(field.objectMetadataId),
          fieldUniversalIdentifier: field.universalIdentifier,
          fieldName: field.name,
          overrides: field.standardOverrides,
        })),
    ];

    if (overridePlans.length > 0) {
      writeFileSync(
        join(SRC_DIR, 'prerequisites', 'standard-overrides.json'),
        `${JSON.stringify(overridePlans, null, 2)}\n`,
        'utf-8',
      );

      warn(
        `${overridePlans.length} rename(s) of built-in objects or fields cannot ship in the manifest. ` +
          'Apply them with `yarn model:post-install` — see README.',
      );
    }

    // ----------------------------------------------------------- page layouts

    // Widget configurations store raw per-instance ids. The manifest wants the
    // portable form instead — `viewId` becomes `viewUniversalIdentifier` and so
    // on, per FormatRecordSerializedRelationProperties in twenty-shared. Ship
    // the raw ids and every widget would point at rows that do not exist on the
    // target.
    const SERIALIZED_RELATION_KEYS: Record<string, 'view' | 'field'> = {
      viewId: 'view',
      fieldMetadataId: 'field',
      relationTargetFieldMetadataId: 'field',
      aggregateFieldMetadataId: 'field',
      groupByFieldMetadataId: 'field',
      primaryAxisGroupByFieldMetadataId: 'field',
      secondaryAxisGroupByFieldMetadataId: 'field',
    };

    // FieldConfiguration is the exception: its `fieldMetadataId` and `viewId`
    // are plain strings rather than SerializedRelation, so the manifest has no
    // portable form for them. Such a widget can only carry a raw id that will
    // not exist on the target, so it is skipped instead.
    const isPortableWidgetConfiguration = (configuration: unknown) =>
      !(
        configuration !== null &&
        typeof configuration === 'object' &&
        (configuration as Record<string, unknown>).configurationType === 'FIELD'
      );

    const allViewUidById = new Map(
      allViews.map((view) => [view.id, view.universalIdentifier]),
    );

    const toUniversalConfiguration = (
      configuration: unknown,
      context: string,
    ): unknown => {
      if (Array.isArray(configuration)) {
        return configuration.map((entry) =>
          toUniversalConfiguration(entry, context),
        );
      }

      if (configuration === null || typeof configuration !== 'object') {
        return configuration;
      }

      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(
        configuration as Record<string, unknown>,
      )) {
        // GraphQL bookkeeping that has no business in a manifest.
        if (key === '__typename') {
          continue;
        }

        const relationKind = SERIALIZED_RELATION_KEYS[key];

        if (!relationKind || typeof value !== 'string') {
          result[key] = toUniversalConfiguration(value, context);
          continue;
        }

        const resolved =
          relationKind === 'view'
            ? allViewUidById.get(value)
            : fieldsById.get(value)?.universalIdentifier;

        if (!resolved) {
          warn(
            `${context}: configuration.${key} points at ${value}, which is not a known ${relationKind}. Dropped so it cannot dangle on the target.`,
          );

          continue;
        }

        result[`${key.replace(/Id$/, '')}UniversalIdentifier`] = resolved;
      }

      return result;
    };

    const { rows: pageLayouts } = await client.query<{
      id: string;
      universalIdentifier: string;
      name: string;
      type: string | null;
      objectMetadataId: string | null;
      defaultTabToFocusOnMobileAndSidePanelId: string | null;
    }>(
      `select id, "universalIdentifier", name, type, "objectMetadataId",
              "defaultTabToFocusOnMobileAndSidePanelId"
       from core."pageLayout"
       where "workspaceId" = $1 and "deletedAt" is null
         and ("applicationId" = $2 or "objectMetadataId" = any($3::uuid[]))`,
      [workspace.id, customApplicationId, [...customObjectIds]],
    );

    const { rows: pageLayoutTabs } = await client.query<{
      id: string;
      universalIdentifier: string;
      pageLayoutId: string;
      title: string;
      position: number;
      icon: string | null;
      layoutMode: string | null;
    }>(
      `select id, "universalIdentifier", "pageLayoutId", title, position, icon, "layoutMode"
       from core."pageLayoutTab"
       where "workspaceId" = $1 and "deletedAt" is null
         and "pageLayoutId" = any($2::uuid[])`,
      [workspace.id, pageLayouts.map((layout) => layout.id)],
    );

    const { rows: pageLayoutWidgets } = await client.query<{
      universalIdentifier: string;
      pageLayoutTabId: string;
      title: string;
      type: string;
      objectMetadataId: string | null;
      gridPosition: unknown;
      configuration: unknown;
      conditionalDisplay: unknown;
    }>(
      `select "universalIdentifier", "pageLayoutTabId", title, type, "objectMetadataId",
              "gridPosition", configuration, "conditionalDisplay"
       from core."pageLayoutWidget"
       where "workspaceId" = $1 and "deletedAt" is null
         and "pageLayoutTabId" = any($2::uuid[])`,
      [workspace.id, pageLayoutTabs.map((tab) => tab.id)],
    );

    const tabUidById = new Map(
      pageLayoutTabs.map((tab) => [tab.id, tab.universalIdentifier]),
    );

    for (const pageLayout of pageLayouts) {
      const tabs = pageLayoutTabs
        .filter((tab) => tab.pageLayoutId === pageLayout.id)
        .sort((left, right) => left.position - right.position)
        .map((tab) => {
          const widgets = pageLayoutWidgets
            .filter((widget) => widget.pageLayoutTabId === tab.id)
            .filter((widget) => {
              if (isPortableWidgetConfiguration(widget.configuration)) {
                return true;
              }

              warn(
                `Widget "${widget.title}" on tab "${tab.title}" pins a specific field by raw id, which the manifest cannot express portably. It is skipped, so the target's record page will not show that pinned widget.`,
              );

              return false;
            })
            .map((widget) => ({
              universalIdentifier: widget.universalIdentifier,
              title: widget.title,
              type: widget.type,
              objectUniversalIdentifier: objectUid(
                widget.objectMetadataId,
                `widget "${widget.title}"`,
              ),
              gridPosition: widget.gridPosition ?? undefined,
              conditionalDisplay: widget.conditionalDisplay ?? undefined,
              configuration: toUniversalConfiguration(
                widget.configuration,
                `widget "${widget.title}"`,
              ),
            }));

          return {
            universalIdentifier: tab.universalIdentifier,
            title: tab.title,
            position: tab.position,
            icon: tab.icon ?? undefined,
            layoutMode: enumRef(
              'PageLayoutTabLayoutMode',
              tab.layoutMode,
              `tab "${tab.title}"`,
            ),
            ...(widgets.length > 0 ? { widgets } : {}),
          };
        });

      const manifest = {
        universalIdentifier: pageLayout.universalIdentifier,
        name: pageLayout.name,
        type: pageLayout.type ?? undefined,
        objectUniversalIdentifier: objectUid(
          pageLayout.objectMetadataId,
          `page layout "${pageLayout.name}"`,
        ),
        defaultTabToFocusOnMobileAndSidePanelUniversalIdentifier:
          pageLayout.defaultTabToFocusOnMobileAndSidePanelId === null
            ? undefined
            : tabUidById.get(pageLayout.defaultTabToFocusOnMobileAndSidePanelId),
        ...(tabs.length > 0 ? { tabs } : {}),
      };

      write(
        claimFileName(
          'page-layouts',
          toKebabCase(pageLayout.name),
          '.page-layout.ts',
        ),
        renderFile({
          defineFunction: 'definePageLayout',
          body: serialize(manifest),
        }),
      );
    }

    // ---------------------------------------------------- navigation menu items

    const { rows: navigationMenuItems } = await client.query<{
      id: string;
      universalIdentifier: string;
      type: string;
      name: string | null;
      icon: string | null;
      color: string | null;
      position: number;
      viewId: string | null;
      link: string | null;
      folderId: string | null;
      targetObjectMetadataId: string | null;
      pageLayoutId: string | null;
    }>(
      `select id, "universalIdentifier", type, name, icon, color, position, "viewId", link,
              "folderId", "targetObjectMetadataId", "pageLayoutId"
       from core."navigationMenuItem"
       where "workspaceId" = $1 and "applicationId" = $2 and "userWorkspaceId" is null`,
      [workspace.id, customApplicationId],
    );

    const viewUidById = new Map(
      views.map((view) => [view.id, view.universalIdentifier]),
    );
    const pageLayoutUidById = new Map(
      pageLayouts.map((layout) => [layout.id, layout.universalIdentifier]),
    );
    const navigationUidById = new Map(
      navigationMenuItems.map((item) => [item.id, item.universalIdentifier]),
    );

    for (const item of navigationMenuItems) {
      const label =
        item.name ?? objectComment(item.targetObjectMetadataId) ?? item.type;

      const manifest = {
        universalIdentifier: item.universalIdentifier,
        type: enumRef('NavigationMenuItemType', item.type, `nav item ${label}`),
        name: item.name ?? undefined,
        icon: item.icon ?? undefined,
        color: item.color ?? undefined,
        position: item.position,
        viewUniversalIdentifier:
          item.viewId === null ? undefined : viewUidById.get(item.viewId),
        link: item.link ?? undefined,
        folderUniversalIdentifier:
          item.folderId === null
            ? undefined
            : navigationUidById.get(item.folderId),
        targetObjectUniversalIdentifier: objectUid(
          item.targetObjectMetadataId,
          `nav item ${label}`,
        ),
        pageLayoutUniversalIdentifier:
          item.pageLayoutId === null
            ? undefined
            : pageLayoutUidById.get(item.pageLayoutId),
      };

      write(
        claimFileName(
          'navigation-menu-items',
          toKebabCase(label),
          '.navigation-menu-item.ts',
        ),
        renderFile({
          defineFunction: 'defineNavigationMenuItem',
          body: serialize(manifest),
        }),
      );
    }

    // ---------------------------------------------------------------- indexes

    // Only user-created indexes. The rest (foreign key BTREEs, the searchVector
    // GIN) are generated by the server for us on prod, and declaring them would
    // fight with that.
    const { rows: indexes } = await client.query<{
      id: string;
      universalIdentifier: string;
      name: string;
      objectMetadataId: string;
      isUnique: boolean;
      indexType: string | null;
    }>(
      `select id, "universalIdentifier", name, "objectMetadataId", "isUnique", "indexType"
       from core."indexMetadata"
       where "workspaceId" = $1 and "applicationId" = $2 and "isCustom" = true`,
      [workspace.id, customApplicationId],
    );

    const { rows: indexFields } = await client.query<{
      indexMetadataId: string;
      fieldMetadataId: string;
      order: number;
      subFieldName: string | null;
    }>(
      `select "indexMetadataId", "fieldMetadataId", "order", "subFieldName"
       from core."indexFieldMetadata" where "workspaceId" = $1`,
      [workspace.id],
    );

    let emittedIndexCount = 0;

    for (const index of indexes) {
      // The server resolves an index's object against the manifest's own
      // objects, so an index on an object this app does not own cannot ship —
      // it fails the install with "references unknown object". Skip and report.
      if (!customObjectIds.has(index.objectMetadataId)) {
        warn(
          `Unique index on "${objectComment(index.objectMetadataId)}.${indexFields
            .filter((indexField) => indexField.indexMetadataId === index.id)
            .map((indexField) => fieldsById.get(indexField.fieldMetadataId)?.name)
            .join(', ')}" cannot ship: the manifest can only declare indexes on objects it owns. ` +
            'Recreate it by hand on the target if the uniqueness constraint matters there.',
        );

        continue;
      }

      const fields = indexFields
        .filter((indexField) => indexField.indexMetadataId === index.id)
        .sort((left, right) => left.order - right.order)
        .map((indexField) => {
          const targetFieldUid = fieldUid(
            indexField.fieldMetadataId,
            index.name,
          );

          return {
            universalIdentifier: deterministicUuid(
              INDEX_FIELD_NAMESPACE,
              `${index.universalIdentifier}-${targetFieldUid}-${indexField.subFieldName ?? ''}`,
            ),
            fieldUniversalIdentifier: targetFieldUid,
            subFieldName: indexField.subFieldName ?? undefined,
          };
        });

      const manifest = {
        universalIdentifier: index.universalIdentifier,
        objectUniversalIdentifier: raw(
          `${JSON.stringify(objectUid(index.objectMetadataId, index.name))} /* ${objectComment(index.objectMetadataId)} */`,
        ),
        indexType: index.indexType ?? undefined,
        isUnique: index.isUnique,
        fields,
      };

      write(
        claimFileName(
          'indexes',
          `${toKebabCase(objectComment(index.objectMetadataId))}-${toKebabCase(index.name)}`,
          '.index.ts',
        ),
        renderFile({ defineFunction: 'defineIndex', body: serialize(manifest) }),
      );

      emittedIndexCount += 1;
    }

    // ----------------------------------------------------------------- report

    console.log('');
    console.log(`Wrote ${written.length} files:`);
    console.log(`  objects                 ${customObjects.length}`);
    console.log(`  standalone fields       ${standaloneFields.length}`);
    console.log(`  views                   ${views.length}`);
    console.log(`  view fields on standard views  ${standaloneViewFieldCount}`);
    console.log(`  page layouts            ${pageLayouts.length}`);
    console.log(`  navigation menu items   ${navigationMenuItems.length}`);
    console.log(`  custom indexes          ${emittedIndexCount}`);

    if (warnings.length > 0) {
      console.log('');
      console.log(`${warnings.length} warning(s):`);

      for (const message of warnings) {
        console.log(`  - ${message}`);
      }
    }

    console.log('');
    console.log('Next: review `git diff`, then `yarn model:plan` to preview.');
  } finally {
    await client.end();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
