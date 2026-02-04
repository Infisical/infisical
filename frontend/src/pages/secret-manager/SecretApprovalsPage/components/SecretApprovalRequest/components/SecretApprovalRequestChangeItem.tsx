/* eslint-disable no-nested-ternary */
import { faExclamationTriangle, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretDiffView, SecretVersionData } from "@app/components/secrets/diff";
import { Tooltip } from "@app/components/v2";
import { CommitType, SecretV3Raw, TSecretApprovalSecChange, WsTag } from "@app/hooks/api/types";

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
  conflicts: Array<{ secretId: string; op: CommitType }>;
};

const generateItemTitle = (op: CommitType) => {
  let text = { label: "", className: "" };
  if (op === CommitType.CREATE) text = { label: "create", className: "text-green-600" };
  else if (op === CommitType.UPDATE) text = { label: "change", className: "text-yellow-600" };
  else text = { label: "deletion", className: "text-red-600" };

  return (
    <div className="text-md pb-2 font-medium">
      Request for <span className={text.className}>secret {text.label}</span>
    </div>
  );
};

const generateConflictText = (op: CommitType) => {
  if (op === CommitType.CREATE) return <div>Secret already exists</div>;
  if (op === CommitType.UPDATE) return <div>Secret not found</div>;
  return null;
};

// Convert approval data to SecretVersionData format
const convertToSecretVersionData = (
  secret: SecretV3Raw | undefined,
  change?: Omit<TSecretApprovalSecChange, "tags"> & {
    tags?: WsTag[];
    secretMetadata?: { key: string; value: string }[];
    skipMultilineEncoding?: boolean;
  }
): SecretVersionData | undefined => {
  if (secret && !change) {
    return {
      secretKey: secret.secretKey,
      secretValue: secret.secretValue,
      secretValueHidden: secret.secretValueHidden,
      secretComment: secret.secretComment,
      tags: secret.tags?.map((t) => ({ slug: t.slug, color: t.color })),
      secretMetadata: secret.secretMetadata,
      skipMultilineEncoding: secret.skipMultilineEncoding
    };
  }

  if (change) {
    return {
      secretKey: change.secretKey ?? secret?.secretKey,
      secretValue: change.secretValue ?? secret?.secretValue,
      secretValueHidden: change.secretValueHidden ?? secret?.secretValueHidden,
      secretComment: change.secretComment ?? secret?.secretComment,
      tags:
        change.tags?.map((t) => ({ slug: t.slug, color: t.color })) ??
        secret?.tags?.map((t) => ({ slug: t.slug, color: t.color })),
      secretMetadata: change.secretMetadata ?? secret?.secretMetadata,
      skipMultilineEncoding: change.skipMultilineEncoding ?? secret?.skipMultilineEncoding
    };
  }

  return undefined;
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
    hasMerged && conflicts.find((el) => el.op === op && el.secretId === newVersion?.id);
  const hasConflict = Boolean(itemConflict);

  const oldSecretData = convertToSecretVersionData(secretVersion);
  const newSecretData = convertToSecretVersionData(secretVersion, newVersion);

  let operationType: "create" | "update" | "delete" = "update";
  if (op === CommitType.CREATE) operationType = "create";
  else if (op === CommitType.DELETE) operationType = "delete";

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 pt-2 pb-4">
      <div className="flex items-center px-1 py-1">
        <div className="grow">{generateItemTitle(op)}</div>
        {!hasMerged && isStale && (
          <div className="flex items-center text-mineshaft-300">
            <FontAwesomeIcon icon={faInfoCircle} className="text-xs" />
            <span className="ml-1 text-xs">Secret has been changed (stale)</span>
          </div>
        )}
        {hasMerged && hasConflict && (
          <div className="flex items-center space-x-1 text-xs text-bunker-300">
            <Tooltip content="Merge Conflict">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-xs text-red" />
            </Tooltip>
            <div>{generateConflictText(op)}</div>
          </div>
        )}
      </div>
      <div>
        <SecretDiffView
          operationType={operationType}
          oldVersion={oldSecretData}
          newVersion={newSecretData}
        />
      </div>
    </div>
  );
};
