import type { Resource, Scope } from "../../secrets-model";
import type { CommitResourceChange } from "./commits-model";

type Version = { version: number; [key: string]: unknown };

const toSecret = (scope: Scope, id: string, name: string, version: Version): Resource => {
  const value = version.secretValue;
  const tags = Array.isArray(version.tags) ? (version.tags as ({ slug?: string } | string)[]) : [];
  const metadata = (version.secretMetadata ?? version.metadata ?? []) as {
    key: string;
    value: string;
    isEncrypted?: boolean;
  }[];
  return {
    ...scope,
    kind: "secret",
    id,
    name: (version.secretKey as string | undefined) ?? name,
    createdAt: "",
    updatedAt: "",
    value:
      typeof value === "string" && !version.secretValueHidden
        ? { status: "present", value }
        : { status: "unreadable" },
    comment: (version.secretComment as string | undefined) ?? "",
    tags: tags.map((tag) => (typeof tag === "string" ? tag : (tag.slug ?? ""))),
    metadata: metadata.map((entry) => ({
      key: entry.key,
      value: entry.value,
      encrypted: Boolean(entry.isEncrypted)
    })),
    version: version.version,
    skipMultilineEncoding: Boolean(version.skipMultilineEncoding)
  };
};

const toFolder = (scope: Scope, id: string, name: string, version: Version): Resource => ({
  ...scope,
  kind: "folder",
  id,
  name: (version.name as string | undefined) ?? name,
  description: (version.description as string | undefined) ?? "",
  createdAt: "",
  updatedAt: ""
});

export const toCommitChange = (
  scope: Scope,
  change: {
    id: string;
    type: "secret" | "folder";
    action: "create" | "update" | "delete";
    name: string;
    versions?: Version[];
    isRollback?: boolean;
  }
): CommitResourceChange | null => {
  if (!change.versions?.length) return null;
  const sorted = [...change.versions].sort((a, b) => b.version - a.version);
  let before: Version | undefined;
  let after: Version | undefined;
  if (change.action === "update") {
    if (sorted.length < 2) return null;
    [after, before] = change.isRollback ? [sorted[1], sorted[0]] : [sorted[0], sorted[1]];
  } else if (change.action === "create") [after] = sorted;
  else [before] = sorted;
  const build = change.type === "secret" ? toSecret : toFolder;
  return {
    resourceType: change.type,
    action: change.action,
    name: change.name,
    before: before && build(scope, change.id, change.name, before),
    after: after && build(scope, change.id, change.name, after)
  };
};
