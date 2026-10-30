import { FolderVersionData, SecretVersionData } from "@app/components/secrets/diff";

import { ResourceChange } from "./ResourceChangeCard";

type Version = {
  version: number;
  [key: string]: unknown;
};

const toSecretVersionData = (version?: Version): SecretVersionData | undefined => {
  if (!version) return undefined;

  let tags: SecretVersionData["tags"];
  if (Array.isArray(version.tags)) {
    tags = (version.tags as Array<{ slug?: string; color?: string } | string>).map((tag) =>
      typeof tag === "string"
        ? { slug: tag, color: "" }
        : { slug: tag.slug ?? "", color: tag.color ?? "" }
    );
  }

  return {
    isRedacted: version.isRedacted as boolean | undefined,
    secretKey: version.secretKey as string | undefined,
    secretValue: version.secretValue as string | undefined,
    secretValueHidden: version.secretValueHidden as boolean | undefined,
    secretComment: version.comment as string | undefined,
    tags,
    secretMetadata: (version.metadata ?? version.secretMetadata) as
      | SecretVersionData["secretMetadata"]
      | undefined,
    skipMultilineEncoding: version.skipMultilineEncoding as boolean | undefined
  };
};

const toFolderVersionData = (version?: Version): FolderVersionData | undefined => {
  if (!version) return undefined;

  return {
    name: version.name as string | undefined,
    description: version.description as string | undefined
  };
};

/**
 * Turns a commit or rollback change into the previous/new pair the diff views render.
 * Returns null when the change carries no usable versions, which happens for an
 * update whose earlier version has already been pruned by the version limit.
 */
export const buildResourceChange = ({
  id,
  type,
  operationType,
  name,
  versions,
  isRollback = false
}: {
  id: string;
  type: "secret" | "folder";
  operationType: "create" | "update" | "delete";
  name: string;
  versions?: Version[];
  isRollback?: boolean;
}): ResourceChange | null => {
  if (!versions?.length) return null;

  const sorted = [...versions].sort((a, b) => b.version - a.version);

  let previous: Version | undefined;
  let next: Version | undefined;

  if (operationType === "update") {
    if (sorted.length < 2) return null;
    // A rollback presents the versions in the opposite order to a commit: its "new"
    // state is the older version being restored
    [next, previous] = isRollback ? [sorted[1], sorted[0]] : [sorted[0], sorted[1]];
  } else if (operationType === "create") {
    [next] = sorted;
  } else {
    [previous] = sorted;
  }

  const base = { id, type, operationType, name };

  return type === "secret"
    ? {
        ...base,
        type: "secret",
        oldSecret: toSecretVersionData(previous),
        newSecret: toSecretVersionData(next)
      }
    : {
        ...base,
        type: "folder",
        oldFolder: toFolderVersionData(previous),
        newFolder: toFolderVersionData(next)
      };
};
