import { MaximizeIcon, MinimizeIcon } from "lucide-react";

import {
  FOLDER_FIELD_LABELS,
  FOLDER_FIELD_ORDER,
  FOLDER_IDENTITY_FIELD,
  getFolderFieldChanges,
  getFolderPopulatedFields,
  getSecretFieldChanges,
  getSecretPopulatedFields,
  SECRET_FIELD_LABELS,
  SECRET_FIELD_ORDER,
  SECRET_IDENTITY_FIELD,
  summarizeCompactFields
} from "@app/components/secrets/diff/fieldChanges";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@app/components/v4/ui/accordion";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";

import type { Resource } from "../../secrets-model";
import type { CommitResourceChange } from "./commits-model";
import {
  CompactFolderDiffView,
  CompactSecretDiffView,
  FolderDiffView,
  type FolderVersionData,
  SecretDiffView,
  type SecretVersionData
} from "./diff-view";

import styles from "./commits.module.css";

export type ResourceChange = CommitResourceChange & { id: string };

const OPERATION_BADGE = {
  create: { label: "Added", tone: "ok" },
  update: { label: "Updated", tone: "warn" },
  delete: { label: "Deleted", tone: "bad" }
} as const;

const ORDER = { delete: 0, update: 1, create: 2 };

export const sortChanges = (changes: readonly CommitResourceChange[]): ResourceChange[] =>
  changes
    .map((change, index) => ({ ...change, id: `${index}:${change.resourceType}:${change.name}` }))
    .sort((a, b) => {
      if (a.action !== b.action) return ORDER[a.action] - ORDER[b.action];
      if (a.resourceType !== b.resourceType) return a.resourceType === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

const toSecretData = (resource?: Resource): SecretVersionData | undefined => {
  if (resource?.kind !== "secret") return undefined;
  return {
    secretKey: resource.name,
    secretValue: resource.value.status === "present" ? resource.value.value : undefined,
    secretValueHidden: resource.value.status !== "present",
    secretComment: resource.comment,
    tags: resource.tags.map((slug) => ({ slug, color: "" })),
    secretMetadata: resource.metadata.map((entry) => ({
      key: entry.key,
      value: entry.value,
      isEncrypted: entry.encrypted
    })),
    skipMultilineEncoding: resource.skipMultilineEncoding
  };
};

const toFolderData = (resource?: Resource): FolderVersionData | undefined =>
  resource?.kind === "folder"
    ? { name: resource.name, description: resource.description }
    : undefined;

const fieldSummary = (change: ResourceChange) => {
  if (change.resourceType === "secret") {
    const oldVersion = toSecretData(change.before);
    const newVersion = toSecretData(change.after);
    const summary = summarizeCompactFields({
      operationType: change.action,
      fieldOrder: SECRET_FIELD_ORDER,
      identityField: SECRET_IDENTITY_FIELD,
      changes: getSecretFieldChanges(oldVersion, newVersion),
      populated: getSecretPopulatedFields(change.action === "delete" ? oldVersion : newVersion)
    });
    return {
      ...summary,
      identityLabel: SECRET_FIELD_LABELS[SECRET_IDENTITY_FIELD],
      singleChangedLabel: SECRET_FIELD_LABELS[summary.changedKeys[0]]
    };
  }
  const oldVersion = toFolderData(change.before);
  const newVersion = toFolderData(change.after);
  const summary = summarizeCompactFields({
    operationType: change.action,
    fieldOrder: FOLDER_FIELD_ORDER,
    identityField: FOLDER_IDENTITY_FIELD,
    changes: getFolderFieldChanges(oldVersion, newVersion),
    populated: getFolderPopulatedFields(change.action === "delete" ? oldVersion : newVersion)
  });
  return {
    ...summary,
    identityLabel: FOLDER_FIELD_LABELS[FOLDER_IDENTITY_FIELD],
    singleChangedLabel: FOLDER_FIELD_LABELS[summary.changedKeys[0]]
  };
};

export function ResourceChangeCard({
  change,
  isCollapsed,
  onToggleCollapse,
  isFullState,
  onToggleFullState
}: {
  change: ResourceChange;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isFullState: boolean;
  onToggleFullState: () => void;
}) {
  const { changedCount, identityLabel, singleChangedLabel } = fieldSummary(change);
  const badge = OPERATION_BADGE[change.action];
  const isUpdate = change.action === "update";
  let changedLabel = "";
  if (isUpdate)
    changedLabel =
      changedCount === 1
        ? `${singleChangedLabel.toLowerCase()} changed`
        : `${changedCount} fields changed`;
  let compactToggleLabel = `Show ${identityLabel.toLowerCase()} only`;
  if (isUpdate) compactToggleLabel = "Show changed properties only";
  else if (change.action === "create") compactToggleLabel = "Show set properties only";
  const diffProps = { operationType: change.action, resourceLabel: "state" };
  let diff = isFullState ? (
    <FolderDiffView
      {...diffProps}
      oldVersion={toFolderData(change.before)}
      newVersion={toFolderData(change.after)}
      showChangedMarkers={isUpdate}
    />
  ) : (
    <CompactFolderDiffView
      {...diffProps}
      oldVersion={toFolderData(change.before)}
      newVersion={toFolderData(change.after)}
    />
  );
  if (change.resourceType === "secret")
    diff = isFullState ? (
      <SecretDiffView
        {...diffProps}
        oldVersion={toSecretData(change.before)}
        newVersion={toSecretData(change.after)}
        showChangedMarkers={isUpdate}
      />
    ) : (
      <CompactSecretDiffView
        {...diffProps}
        oldVersion={toSecretData(change.before)}
        newVersion={toSecretData(change.after)}
      />
    );
  return (
    <Accordion
      type="single"
      collapsible
      value={isCollapsed ? "" : change.id}
      onValueChange={onToggleCollapse}
    >
      <AccordionItem value={change.id} className={styles.card}>
        <AccordionTrigger>
          <span className={styles.cardTitle}>
            <Icon
              name={change.resourceType === "secret" ? "key" : "folder"}
              size={16}
              className={styles.titleIcon}
            />
            <span
              className={styles.cardName}
              data-deleted={change.action === "delete" || undefined}
            >
              {change.name}
            </span>
            {changedLabel && <span className={styles.cardChanged}>{changedLabel}</span>}
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </span>
        </AccordionTrigger>
        <AccordionContent className={styles.accordionBody}>
          <div className={styles.cardBody}>
            {diff}
            <Button variant="ghost" size="xs" onClick={onToggleFullState}>
              <Icon icon={isFullState ? MinimizeIcon : MaximizeIcon} />
              {isFullState ? compactToggleLabel : "Show full state"}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
