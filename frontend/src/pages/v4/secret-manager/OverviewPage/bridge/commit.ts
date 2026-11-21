import { PendingAction } from "@app/hooks/api/secretFolders/types";
import type { WsTag } from "@app/hooks/api/tags/types";
import type { PendingChanges } from "@app/pages/secret-manager/SecretDashboardPage/SecretMainPage.store";

import { readableValue, type Secret } from "../secrets-model";
import type { PendingChange, PendingResource } from "../secrets/batch/pending";

const tagRefs = (tags: readonly WsTag[], slugs: string[]) =>
  tags.filter((tag) => slugs.includes(tag.slug)).map((tag) => ({ id: tag.id, slug: tag.slug }));
const metadataOf = (secret: Secret) =>
  secret.metadata.map((entry) => ({
    key: entry.key,
    value: entry.value,
    isEncrypted: entry.encrypted
  }));
const folderPath = (folder: PendingResource) =>
  `${folder.path === "/" ? "" : folder.path}/${folder.name}`;

export const toPendingChanges = (
  changes: readonly PendingChange[],
  tags: readonly WsTag[]
): PendingChanges => {
  const timestamp = Date.now();
  const result: PendingChanges = { secrets: [], folders: [] };
  changes.forEach((change) => {
    const { original, next } = change;
    const target = (next ?? original)!;
    if (target.kind === "folder") {
      if (change.type === "create" && next?.kind === "folder")
        result.folders.push({
          id: next.id,
          timestamp,
          resourceType: "folder",
          type: PendingAction.Create,
          folderName: next.name,
          description: next.description || undefined,
          parentPath: next.path
        });
      else if (change.type === "update" && original?.kind === "folder" && next?.kind === "folder")
        result.folders.push({
          id: original.id,
          timestamp,
          resourceType: "folder",
          type: PendingAction.Update,
          originalFolderName: original.name,
          folderName: next.name,
          originalDescription: original.description,
          description: next.description
        });
      else if (original?.kind === "folder")
        result.folders.push({
          id: original.id,
          timestamp,
          resourceType: "folder",
          type: PendingAction.Delete,
          folderName: original.name,
          folderPath: folderPath(original)
        });
      return;
    }
    if (change.type === "create" && next?.kind === "secret") {
      result.secrets.push({
        id: change.id,
        timestamp,
        resourceType: "secret",
        type: PendingAction.Create,
        secretKey: next.name,
        secretValue: readableValue(next) ?? "",
        secretComment: next.comment,
        skipMultilineEncoding: next.skipMultilineEncoding,
        tags: tagRefs(tags, next.tags),
        secretMetadata: metadataOf(next)
      });
      return;
    }
    if (change.type === "delete" && original?.kind === "secret") {
      result.secrets.push({
        id: change.id,
        timestamp,
        resourceType: "secret",
        type: PendingAction.Delete,
        secretKey: original.name,
        secretValue: readableValue(original) ?? "",
        secretValueHidden: original.value.status === "unreadable",
        tags: tagRefs(tags, original.tags),
        secretMetadata: metadataOf(original),
        skipMultilineEncoding: original.skipMultilineEncoding ?? null,
        comment: original.comment
      });
      return;
    }
    if (original?.kind !== "secret" || next?.kind !== "secret") return;
    const value = readableValue(next);
    result.secrets.push({
      id: change.id,
      timestamp,
      resourceType: "secret",
      type: PendingAction.Update,
      secretKey: original.name,
      newSecretName: next.name !== original.name ? next.name : undefined,
      originalValue: readableValue(original),
      secretValue: value !== readableValue(original) ? value : undefined,
      originalComment: original.comment,
      secretComment: next.comment,
      originalSkipMultilineEncoding: original.skipMultilineEncoding ?? null,
      skipMultilineEncoding: next.skipMultilineEncoding ?? null,
      originalTags: tagRefs(tags, original.tags),
      tags: tagRefs(tags, next.tags),
      secretMetadata: metadataOf(next),
      existingSecret: {
        id: original.id,
        version: original.version,
        key: original.name,
        secretValueHidden: original.value.status === "unreadable",
        comment: original.comment,
        createdAt: original.createdAt,
        updatedAt: original.updatedAt,
        env: original.environment,
        path: original.path
      }
    });
  });
  return result;
};
