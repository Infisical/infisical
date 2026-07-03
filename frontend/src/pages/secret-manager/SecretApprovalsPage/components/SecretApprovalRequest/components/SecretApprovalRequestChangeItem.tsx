import { InfoIcon, TriangleAlertIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { CommitType, SecretV3Raw, TSecretApprovalSecChange, WsTag } from "@app/hooks/api/types";
import {
  DiffViewItem,
  SecretVersionDiffView
} from "@app/pages/secret-manager/CommitDetailsPage/components/SecretVersionDiffView/SecretVersionDiffView";

export type Props = {
  op: CommitType;
  secretVersion?: SecretV3Raw;
  newVersion?: Omit<TSecretApprovalSecChange, "tags"> & {
    tags?: WsTag[];
    secretMetadata?: { key: string; value: string }[];
    skipMultilineEncoding?: boolean | null;
  };
  presentSecretVersionNumber: number;
  hasMerged?: boolean;
  conflicts?: Array<{ secretId: string; op: CommitType }> | null;
};

const getConflictText = (op: CommitType) => {
  if (op === CommitType.CREATE) return "Secret already exists";
  if (op === CommitType.UPDATE) return "Secret not found";
  return "";
};

export const SecretApprovalRequestChangeItem = ({
  op,
  secretVersion,
  newVersion,
  presentSecretVersionNumber,
  hasMerged,
  conflicts
}: Props) => {
  // meaning request has changed
  const isStale = (secretVersion?.version || 1) < presentSecretVersionNumber;
  const itemConflict =
    hasMerged && conflicts?.find((el) => el.op === op && el.secretId === newVersion?.id);
  const hasConflict = Boolean(itemConflict);

  const secretKey = newVersion?.secretKey ?? secretVersion?.secretKey;
  const id = newVersion?.id ?? secretVersion?.id ?? `${op}-${secretKey ?? "secret"}`;

  const oldVersionData = secretVersion
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

  const newVersionData = {
    version: 2,
    secretKey: newVersion?.secretKey,
    secretValue: newVersion?.secretValue,
    secretValueHidden: newVersion?.secretValueHidden,
    comment: newVersion?.secretComment,
    tags: newVersion?.tags,
    secretMetadata: newVersion?.secretMetadata,
    skipMultilineEncoding: newVersion?.skipMultilineEncoding ?? undefined
  };

  let item: DiffViewItem;
  if (op === CommitType.CREATE) {
    item = {
      type: "secret",
      id,
      secretKey,
      isAdded: true,
      versions: [{ ...newVersionData, version: 1 }]
    };
  } else if (op === CommitType.DELETE) {
    item = { type: "secret", id, secretKey, isDeleted: true, versions: [oldVersionData] };
  } else {
    item = {
      type: "secret",
      id,
      secretKey,
      isUpdated: true,
      versions: [oldVersionData, newVersionData]
    };
  }

  let headerExtra: JSX.Element | undefined;
  if (!hasMerged && isStale) {
    headerExtra = (
      <span className="flex items-center gap-1 text-xs text-muted">
        <InfoIcon className="size-3.5" />
        Stale
      </span>
    );
  } else if (hasMerged && hasConflict) {
    headerExtra = (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1 text-xs text-danger">
            <TriangleAlertIcon className="size-3.5" />
            {getConflictText(op)}
          </span>
        </TooltipTrigger>
        <TooltipContent>Merge Conflict</TooltipContent>
      </Tooltip>
    );
  }

  return <SecretVersionDiffView item={item} showViewed headerExtra={headerExtra} />;
};
