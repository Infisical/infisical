import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@infisical/cipher/ui/accordion";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Icon } from "@infisical/cipher/ui/icon";
import { MaximizeIcon, MinimizeIcon } from "lucide-react";

import { fieldSummary, type ResourceChange, toFolderData, toSecretData } from "./commits-model";
import {
  CompactFolderDiffView,
  CompactSecretDiffView,
  FolderDiffView,
  SecretDiffView
} from "./diff-view";

import styles from "./commits.module.css";

const OPERATION_BADGE = {
  create: { label: "Added", tone: "ok" },
  update: { label: "Updated", tone: "warn" },
  delete: { label: "Deleted", tone: "bad" }
} as const;

function ChangeDiff({ change, isFullState }: { change: ResourceChange; isFullState: boolean }) {
  const props = { operationType: change.action, resourceLabel: "state" };
  const isUpdate = change.action === "update";
  if (change.resourceType === "secret") {
    const versions = {
      oldVersion: toSecretData(change.before),
      newVersion: toSecretData(change.after)
    };
    return isFullState ? (
      <SecretDiffView {...props} {...versions} showChangedMarkers={isUpdate} />
    ) : (
      <CompactSecretDiffView {...props} {...versions} />
    );
  }
  const versions = {
    oldVersion: toFolderData(change.before),
    newVersion: toFolderData(change.after)
  };
  return isFullState ? (
    <FolderDiffView {...props} {...versions} showChangedMarkers={isUpdate} />
  ) : (
    <CompactFolderDiffView {...props} {...versions} />
  );
}

const COMPACT_TOGGLE_LABEL = {
  create: "Show set properties only",
  update: "Show changed properties only"
} as const;

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
  const { changedCount, identityLabel, singleChangedLabel, hasHiddenState } = fieldSummary(change);
  const badge = OPERATION_BADGE[change.action];
  let changedLabel = "";
  if (change.action === "update")
    changedLabel =
      changedCount === 1
        ? `${singleChangedLabel.toLowerCase()} changed`
        : `${changedCount} fields changed`;
  const compactToggleLabel =
    change.action === "delete"
      ? `Show ${identityLabel.toLowerCase()} only`
      : COMPACT_TOGGLE_LABEL[change.action];
  return (
    <Accordion
      type="single"
      collapsible
      value={isCollapsed ? "" : change.id}
      onValueChange={onToggleCollapse}
    >
      <AccordionItem value={change.id} className={styles.card}>
        <AccordionTrigger className={styles.cardTrigger}>
          <span className={styles.cardTitle}>
            <Icon
              name={change.resourceType === "secret" ? "key" : "folder"}
              size={16}
              className={styles.cardIcon}
            />
            <span className={styles.cardText}>
              <span
                className={styles.cardName}
                data-deleted={change.action === "delete" || undefined}
              >
                {change.name}
              </span>
              <span className={styles.cardTags}>
                {changedLabel && <span className={styles.cardChanged}>{changedLabel}</span>}
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className={styles.accordionBody}>
          <div className={styles.cardBody}>
            <ChangeDiff change={change} isFullState={isFullState} />
            {hasHiddenState && (
              <Button
                variant="ghost"
                size="xs"
                className={styles.stateToggle}
                onClick={onToggleFullState}
              >
                <Icon icon={isFullState ? MinimizeIcon : MaximizeIcon} />
                {isFullState ? compactToggleLabel : "Show full state"}
              </Button>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
