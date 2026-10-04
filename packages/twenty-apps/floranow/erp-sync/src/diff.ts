// Does the value we would write differ from what the CRM already holds?
// Composite fields (CURRENCY, ADDRESS) compare by their meaningful parts;
// scalars compare by value, treating null and undefined as the same "empty".
export const valuesDiffer = (current: unknown, next: unknown): boolean => {
  if (typeof next === 'object' && next !== null) {
    const currentObject = (current ?? {}) as Record<string, unknown>;

    return Object.entries(next).some(
      ([key, value]) => (currentObject[key] ?? null) !== (value ?? null),
    );
  }

  return (current ?? null) !== (next ?? null);
};

// Given the fields we would write and the record already in the CRM, return
// only the fields whose value actually changed. An empty result means the
// record is already current and needs no write.
export const changedFieldsOnly = (
  next: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> => {
  const changed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(next)) {
    if (valuesDiffer(current[key], value)) {
      changed[key] = value;
    }
  }

  return changed;
};
