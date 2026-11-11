// Frozen copies of the name limits at the time services moved to project scope, so a later change to the app's limits
// can't change what this migration did. A database or SSH service is reached by its name, which caps it at 63.
const NAME_MAX_LENGTH = 64;
const NATIVE_NAME_MAX_LENGTH = 63;
const NATIVE_SERVICE_TYPES = new Set(["postgres", "mysql", "ssh"]);

export type TServiceNameRow = {
  id: string;
  projectId: string;
  name: string;
  type: string;
  accessBundleName: string;
  createdAt: Date;
};

// Cutting a slug can leave a hyphen at the end, which a slug never has.
const fitSlug = (slug: string, max: number) => slug.slice(0, max).replace(/-+$/, "");

// A suffix too long to fit is cut first, so the result always starts with some of the service's own name.
const withSuffix = (base: string, suffix: string, max: number) => {
  const fittedSuffix = fitSlug(suffix, max - 2);
  return `${fitSlug(base, max - fittedSuffix.length - 1)}-${fittedSuffix}`;
};

/**
 * Service names were unique per access bundle and are now unique per project. In each project the oldest service keeps
 * a shared name and every later one takes `<name>-<bundle name>`, or the first free `<name>-<bundle name>-1`, `-2` ...
 * when that is taken too. A new name never takes one any service already holds, so no service that keeps its name is
 * ever touched. Nor does it take a name in `reservedNames`, the names of inline services in the project's live
 * sessions: a session holds its bundle's services beside its own, and an agent connects to a database or SSH service
 * by name, so a renamed service sharing one would be reached instead of, or through, the inline one.
 */
export const findServiceNameRenames = (
  rows: TServiceNameRow[],
  reservedNames: Map<string, Set<string>> = new Map()
): Map<string, string> => {
  const renames = new Map<string, string>();

  const byProject = new Map<string, TServiceNameRow[]>();
  rows.forEach((row) => {
    const projectRows = byProject.get(row.projectId) ?? [];
    projectRows.push(row);
    byProject.set(row.projectId, projectRows);
  });

  byProject.forEach((projectRows, projectId) => {
    const taken = new Set([...projectRows.map((row) => row.name), ...(reservedNames.get(projectId) ?? [])]);
    const seen = new Set<string>();

    [...projectRows]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .forEach((row) => {
        if (!seen.has(row.name)) {
          seen.add(row.name);
          return;
        }
        const max = NATIVE_SERVICE_TYPES.has(row.type) ? NATIVE_NAME_MAX_LENGTH : NAME_MAX_LENGTH;
        let renamed = withSuffix(row.name, row.accessBundleName, max);
        for (let n = 1; taken.has(renamed); n += 1) {
          renamed = withSuffix(withSuffix(row.name, row.accessBundleName, max), String(n), max);
        }
        taken.add(renamed);
        renames.set(row.id, renamed);
      });
  });

  return renames;
};
