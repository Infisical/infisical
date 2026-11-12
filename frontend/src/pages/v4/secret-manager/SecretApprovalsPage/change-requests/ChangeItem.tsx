import type { ReactNode } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import { CommitType } from "@app/hooks/api/secretApprovalRequest/types";

import {
  type DiffViewItem,
  SecretVersionDiffView
} from "../../OverviewPage/secrets/commits/diff-view";
import type { ChangeRequest } from "./parts";

const conflictText = (op: CommitType) => {
  if (op === CommitType.CREATE) return "Secret already exists";
  if (op === CommitType.UPDATE) return "Secret not found";
  return "Merge conflict";
};

export const ChangeItem = ({
  commit,
  conflicts,
  hasMerged
}: {
  commit: ChangeRequest["commits"][number];
  conflicts?: ChangeRequest["conflicts"] | null;
  hasMerged?: boolean;
}) => {
  const { op, secretVersion, secret, ...next } = commit;
  const isStale = (secretVersion?.version || 1) < (secret?.version || 0);
  const hasConflict = Boolean(
    hasMerged && conflicts?.some((entry) => entry.op === op && entry.secretId === next.id)
  );
  const secretKey = next.secretKey ?? secretVersion?.secretKey;
  const id = next.id ?? secretVersion?.id ?? `${op}-${secretKey ?? "secret"}`;
  const previous = secretVersion
    ? {
        version: 1,
        secretKey: secretVersion.secretKey,
        secretValue: secretVersion.secretValue,
        secretValueHidden: secretVersion.secretValueHidden,
        comment: secretVersion.secretComment,
        tags: secretVersion.tags,
        secretMetadata: secretVersion.secretMetadata,
        skipMultilineEncoding: secretVersion.skipMultilineEncoding ?? undefined
      }
    : { version: 1 };
  const proposed = {
    version: 2,
    secretKey: next.secretKey,
    secretValue: next.secretValue,
    secretValueHidden: (next as { secretValueHidden?: boolean }).secretValueHidden,
    comment: next.secretComment,
    tags: next.tags,
    secretMetadata: next.secretMetadata,
    skipMultilineEncoding: next.skipMultilineEncoding ?? undefined
  };
  let item: DiffViewItem = {
    type: "secret",
    id,
    secretKey,
    isUpdated: true,
    versions: [previous, proposed]
  };
  if (op === CommitType.CREATE || op === CommitType.ADD)
    item = {
      type: "secret",
      id,
      secretKey,
      isAdded: true,
      versions: [{ ...proposed, version: 1 }]
    };
  if (op === CommitType.DELETE)
    item = { type: "secret", id, secretKey, isDeleted: true, versions: [previous] };

  let headerExtra: ReactNode;
  if (!hasMerged && isStale)
    headerExtra = (
      <Tooltip content="This secret changed after the request was opened.">
        <Badge tone="soft">Stale</Badge>
      </Tooltip>
    );
  else if (hasConflict)
    headerExtra = (
      <Tooltip content="Merge conflict">
        <Badge tone="bad">{conflictText(op)}</Badge>
      </Tooltip>
    );

  return <SecretVersionDiffView item={item} showViewed headerExtra={headerExtra} />;
};
