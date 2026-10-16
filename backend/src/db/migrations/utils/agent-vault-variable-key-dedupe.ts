// Frozen copy of the key limit at the time variables moved to product scope, so a later change to the app's limit
// can't change what this migration did.
const KEY_MAX_LENGTH = 64;

export type TVariableKeyRow = { id: string; projectId: string; key: string; createdAt: Date };

const withSuffix = (key: string, n: number) => {
  const suffix = `_${n}`;
  return `${key.slice(0, KEY_MAX_LENGTH - suffix.length)}${suffix}`;
};

/**
 * Keys were unique per access bundle and are now unique per project. In each project the oldest variable keeps a
 * shared key and every later one takes the first free `KEY_1`, `KEY_2`, ... A renamed key never takes one any
 * variable already holds, so no variable that keeps its key is ever touched. Services seal variables by id, not
 * key, so a rename changes nothing a service sends.
 */
export const findVariableKeyRenames = (rows: TVariableKeyRow[]): Map<string, string> => {
  const renames = new Map<string, string>();

  const byProject = new Map<string, TVariableKeyRow[]>();
  rows.forEach((row) => {
    const projectRows = byProject.get(row.projectId) ?? [];
    projectRows.push(row);
    byProject.set(row.projectId, projectRows);
  });

  byProject.forEach((projectRows) => {
    const taken = new Set(projectRows.map((row) => row.key));
    const seen = new Set<string>();

    [...projectRows]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .forEach((row) => {
        if (!seen.has(row.key)) {
          seen.add(row.key);
          return;
        }
        let n = 1;
        while (taken.has(withSuffix(row.key, n))) n += 1;
        const renamed = withSuffix(row.key, n);
        taken.add(renamed);
        renames.set(row.id, renamed);
      });
  });

  return renames;
};
