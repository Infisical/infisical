import {
  readableValue,
  type Resource,
  type Scope,
  scopeMatches,
  type Secret,
  versionsOf
} from "../../secrets-model";

export type PendingResource = Secret | Extract<Resource, { kind: "folder" }>;
export type PendingType = "create" | "update" | "delete";
export type PendingChange = {
  id: string;
  type: PendingType;
  original?: PendingResource;
  next?: PendingResource;
};

export const pendingTarget = (change: PendingChange) =>
  (change.next ?? change.original) as PendingResource;

export const pendingIn = (pending: readonly PendingChange[], scope: Scope) =>
  pending.filter((change) => scopeMatches(pendingTarget(change), scope));

export const withPending = (resources: readonly Resource[], pending: readonly PendingChange[]) => {
  const updates = new Map(
    pending.flatMap((change) =>
      change.type === "update" && change.original && change.next
        ? [[change.original.id, change.next] as const]
        : []
    )
  );
  return [
    ...resources.map((resource) => updates.get(resource.id) ?? resource),
    ...pending.flatMap((change) => (change.type === "create" && change.next ? [change.next] : []))
  ];
};

export const pendingMarks = (pending: readonly PendingChange[]) =>
  Object.fromEntries(pending.map((change) => [pendingTarget(change).id, change.type])) as Record<
    string,
    PendingType
  >;

const comparable = (resource: PendingResource) =>
  resource.kind === "folder"
    ? JSON.stringify([resource.name, resource.description])
    : JSON.stringify([
        resource.name,
        resource.value,
        resource.comment,
        resource.tags,
        resource.metadata,
        Boolean(resource.skipMultilineEncoding)
      ]);

export const isUnchanged = (change: PendingChange) =>
  change.type === "update" &&
  Boolean(change.original && change.next) &&
  comparable(change.original as PendingResource) === comparable(change.next as PendingResource);

export const stagePending = (
  pending: readonly PendingChange[],
  shown: PendingResource,
  next: PendingResource,
  base: readonly Resource[]
): PendingChange[] => {
  const existing = pending.find((change) => pendingTarget(change).id === shown.id);
  if (existing) {
    const merged = { ...existing, next };
    return isUnchanged(merged)
      ? pending.filter((change) => change !== existing)
      : pending.map((change) => (change === existing ? merged : change));
  }
  const original = base.find((resource) => resource.id === shown.id) as PendingResource | undefined;
  const change: PendingChange = { id: crypto.randomUUID(), type: "update", original, next };
  return isUnchanged(change) ? [...pending] : [...pending, change];
};

const folderPath = (folder: PendingResource) =>
  `${folder.path === "/" ? "" : folder.path}/${folder.name}`;

export const applyPending = (
  resources: readonly Resource[],
  changes: readonly PendingChange[],
  actor: string
): Resource[] => {
  const timestamp = new Date().toISOString();
  return changes.reduce<Resource[]>(
    (current, change) => {
      const { original, next } = change;
      if (change.type === "create" && next)
        return [...current, { ...next, createdAt: timestamp, updatedAt: timestamp }];
      if (change.type === "delete" && original)
        return current.filter((resource) => {
          if (resource.id === original.id) return false;
          if (original.kind !== "folder") return true;
          const removed = folderPath(original);
          return !(
            resource.project === original.project &&
            resource.environment === original.environment &&
            (resource.path === removed || resource.path.startsWith(`${removed}/`))
          );
        });
      if (!original || !next) return current;
      const oldPath = original.kind === "folder" ? folderPath(original) : undefined;
      const newPath = next.kind === "folder" ? folderPath(next) : undefined;
      return current.map((resource): Resource => {
        if (resource.id === original.id) {
          if (next.kind !== "secret" || resource.kind !== "secret")
            return { ...next, updatedAt: timestamp };
          const value = readableValue(next);
          if (value === undefined || value === readableValue(resource))
            return { ...next, updatedAt: timestamp };
          const version = resource.version + 1;
          return {
            ...next,
            version,
            updatedAt: timestamp,
            versions: [
              { version, value, createdAt: timestamp, actor, actorType: "user" },
              ...versionsOf(resource)
            ]
          };
        }
        if (
          oldPath &&
          newPath &&
          oldPath !== newPath &&
          resource.project === original.project &&
          resource.environment === original.environment &&
          (resource.path === oldPath || resource.path.startsWith(`${oldPath}/`))
        )
          return { ...resource, path: `${newPath}${resource.path.slice(oldPath.length)}` };
        return resource;
      });
    },
    [...resources]
  );
};
