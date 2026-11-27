import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Icon } from "@infisical/cipher/ui/icon";
import { MaximizeIcon, MinimizeIcon } from "lucide-react";

import {
  getSecretFieldChanges,
  getSecretPopulatedFields,
  type ResourceOperationType,
  SECRET_FIELD_ORDER,
  SECRET_IDENTITY_FIELD
} from "@app/components/secrets/diff/fieldChanges";
import type { SecretVersionData } from "@app/components/secrets/diff/types";
import { CommitType } from "@app/hooks/api/secretApprovalRequest/types";

import { SecretDiffView } from "../../OverviewPage/secrets/commits/diff-view";
import type { ChangeRequest } from "./parts";

import styles from "./change-item.module.css";

type Commit = ChangeRequest["commits"][number];
type SecretFields = {
  secretKey?: string;
  secretValue?: string;
  secretValueHidden?: boolean;
  secretComment?: string;
  tags?: { slug: string; color?: string | null }[];
  secretMetadata?: SecretVersionData["secretMetadata"];
  skipMultilineEncoding?: boolean | null;
};

const ACTIONS: Record<CommitType, ResourceOperationType> = {
  [CommitType.CREATE]: "create",
  [CommitType.ADD]: "create",
  [CommitType.UPDATE]: "update",
  [CommitType.DELETE]: "delete"
};

const ACTION_LABEL: Record<ResourceOperationType, string> = {
  create: "Added",
  update: "Updated",
  delete: "Deleted"
};

const conflictText = (op: CommitType) => {
  if (op === CommitType.CREATE) return "Secret already exists";
  if (op === CommitType.UPDATE) return "Secret not found";
  return "Merge conflict";
};

const toSecretData = (fields: SecretFields): SecretVersionData => ({
  secretKey: fields.secretKey,
  secretValue: fields.secretValue,
  secretValueHidden: fields.secretValueHidden,
  secretComment: fields.secretComment,
  tags: fields.tags?.map(({ slug, color }) => ({ slug, color: color ?? "" })),
  secretMetadata: fields.secretMetadata,
  skipMultilineEncoding: fields.skipMultilineEncoding ?? undefined
});

const resolveChange = ({ op, secretVersion, secret: _secret, ...next }: Commit) => {
  const action = ACTIONS[op];
  const oldVersion =
    action === "create" || !secretVersion ? undefined : toSecretData(secretVersion);
  const newVersion = action === "delete" ? undefined : toSecretData(next as SecretFields);
  const changes = getSecretFieldChanges(oldVersion, newVersion);
  const oldPopulated = getSecretPopulatedFields(oldVersion);
  const newPopulated = getSecretPopulatedFields(newVersion);
  const populated = action === "delete" ? oldPopulated : newPopulated;
  return {
    action,
    oldVersion,
    newVersion,
    secretKey: next.secretKey ?? secretVersion?.secretKey ?? "Unnamed secret",
    compact: SECRET_FIELD_ORDER.filter((key) =>
      action === "update" ? changes[key] : key !== SECRET_IDENTITY_FIELD && populated[key]
    ),
    full: SECRET_FIELD_ORDER.filter(
      (key) =>
        changes[key] || (key !== SECRET_IDENTITY_FIELD && (oldPopulated[key] || newPopulated[key]))
    )
  };
};

const ChangeFlag = ({
  commit,
  conflicts,
  hasMerged
}: {
  commit: Commit;
  conflicts?: ChangeRequest["conflicts"] | null;
  hasMerged?: boolean;
}) => {
  const isStale = (commit.secretVersion?.version || 1) < (commit.secret?.version || 0);
  if (!hasMerged && isStale)
    return (
      <Badge reason="This secret changed after the request was opened." tone="soft">
        Stale
      </Badge>
    );
  const hasConflict = conflicts?.some(
    (entry) => entry.op === commit.op && entry.secretId === commit.id
  );
  if (!hasMerged || !hasConflict) return null;
  return (
    <Badge reason="Merge conflict" tone="bad">
      {conflictText(commit.op)}
    </Badge>
  );
};

export const ChangeItem = ({
  commit,
  conflicts,
  hasMerged
}: {
  commit: Commit;
  conflicts?: ChangeRequest["conflicts"] | null;
  hasMerged?: boolean;
}) => {
  const [viewed, setViewed] = useState(false);
  const [isFullState, setIsFullState] = useState(false);
  const { action, oldVersion, newVersion, secretKey, compact, full } = resolveChange(commit);
  const hasHiddenState = full.length > compact.length;
  const fields = isFullState ? full : compact;

  return (
    <div className={styles.change} data-viewed={viewed || undefined}>
      <div className={styles.head}>
        <Icon name="key" size={16} className={styles.icon} />
        <span className={styles.title}>
          <span className={styles.name} data-deleted={action === "delete" || undefined}>
            {secretKey}
          </span>
          <span className={styles.meta}>
            <span className={styles.action} data-action={action}>
              {ACTION_LABEL[action]}
            </span>
            <ChangeFlag commit={commit} conflicts={conflicts} hasMerged={hasMerged} />
          </span>
        </span>
        <span className={styles.viewed}>
          <Checkbox
            label={<span className={styles.viewedLabel}>Viewed</span>}
            checked={viewed}
            onChange={setViewed}
          />
        </span>
      </div>
      {!viewed && (fields.length > 0 || hasHiddenState) && (
        <div className={styles.body}>
          {fields.length > 0 && (
            <SecretDiffView
              operationType={action}
              oldVersion={oldVersion}
              newVersion={newVersion}
              visibleFields={fields}
            />
          )}
          {hasHiddenState && (
            <Button
              variant="ghost"
              size="xs"
              className={styles.stateToggle}
              onClick={() => setIsFullState(!isFullState)}
            >
              <Icon icon={isFullState ? MinimizeIcon : MaximizeIcon} />
              {isFullState ? "Show changed properties only" : "Show full state"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
