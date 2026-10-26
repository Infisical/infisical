import { type ReactNode, useState } from "react";
import { CircleCheckIcon, CircleXIcon, EyeOffIcon } from "lucide-react";

import {
  FOLDER_FIELD_LABELS,
  FOLDER_FIELD_ORDER,
  FOLDER_IDENTITY_FIELD,
  type FolderFieldKey,
  getFolderFieldChanges,
  getFolderPopulatedFields,
  getSecretFieldChanges,
  getSecretPopulatedFields,
  type ResourceOperationType,
  SECRET_FIELD_LABELS,
  SECRET_FIELD_ORDER,
  SECRET_IDENTITY_FIELD,
  type SecretFieldKey,
  summarizeCompactFields
} from "@app/components/secrets/diff/fieldChanges";
import type { FolderVersionData, SecretVersionData } from "@app/components/secrets/diff/types";
import {
  computeLineDiff,
  computeWordDiff,
  isSingleLine,
  splitChangeIntoLines
} from "@app/components/utilities/diff";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@app/components/v4/ui/accordion";
import { Badge } from "@app/components/v4/ui/badge";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { Icon } from "@app/components/v4/ui/icon";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { ActionButton } from "../overview-cells";

import styles from "./diff-view.module.css";

export type { FolderVersionData, SecretVersionData };

const MASK = "••••••••••••••••••••";

const diffVariant = (changed: boolean, isOldVersion: boolean) => {
  if (!changed) return undefined;
  return isOldVersion ? "removed" : "added";
};

function None() {
  return <span className={styles.none}>None</span>;
}

function TextDiff({
  oldText,
  newText,
  isOldVersion
}: {
  oldText: string;
  newText: string;
  isOldVersion: boolean;
}) {
  const highlight = isOldVersion ? styles.removed : styles.added;
  const oldInNew = oldText !== "" && newText !== "" && newText.includes(oldText);
  const newInOld = oldText !== "" && newText !== "" && oldText.includes(newText);
  if (oldInNew || newInOld) {
    const [outer, inner] = oldInNew ? [newText, oldText] : [oldText, newText];
    if (oldInNew === isOldVersion) return <span>{inner}</span>;
    const start = outer.indexOf(inner);
    return (
      <>
        {start > 0 && <span className={highlight}>{outer.slice(0, start)}</span>}
        <span>{inner}</span>
        {start + inner.length < outer.length && (
          <span className={highlight}>{outer.slice(start + inner.length)}</span>
        )}
      </>
    );
  }
  const words = computeWordDiff(oldText, newText);
  if (!words) return <span className={highlight}>{isOldVersion ? oldText : newText}</span>;
  return (
    <>
      {words.map((word, index) => {
        if (isOldVersion ? word.added : word.removed) return null;
        const changed = word.added || word.removed;
        return (
          // eslint-disable-next-line react/no-array-index-key -- word diff segments have no identity beyond their position
          <span key={index} className={changed ? highlight : undefined}>
            {word.value}
          </span>
        );
      })}
    </>
  );
}

function MultiLineDiff({
  oldText,
  newText,
  isOldVersion
}: {
  oldText: string;
  newText: string;
  isOldVersion: boolean;
}) {
  const changes = computeLineDiff(oldText, newText);
  const oldInNew = oldText !== "" && newText !== "" && newText.includes(oldText);
  const newInOld = oldText !== "" && newText !== "" && oldText.includes(newText);
  return (
    <div>
      {changes.flatMap((change, changeIndex) => {
        if (isOldVersion ? change.added : change.removed) return [];
        const next = changes[changeIndex + 1];
        const previous = changes[changeIndex - 1];
        const adjacent = isOldVersion ? next : previous;
        const isModification = isOldVersion
          ? change.removed && next?.added
          : previous?.removed && change.added;
        const isChanged =
          isModification ||
          (isOldVersion ? change.removed && !oldInNew : change.added && !newInOld);
        let mark = " ";
        if (isChanged) mark = isOldVersion ? "-" : "+";
        return splitChangeIntoLines(change.value).map((line, lineIndex) => {
          const key = `${changeIndex}:${lineIndex}`;
          const counterpart = adjacent
            ? (splitChangeIntoLines(adjacent.value)[lineIndex] ?? "")
            : "";
          return (
            <div
              key={key}
              className={styles.line}
              data-change={diffVariant(Boolean(isChanged), isOldVersion)}
            >
              <span className={styles.lineMark}>{mark}</span>
              <span className={styles.lineText}>
                {isModification && adjacent ? (
                  <TextDiff
                    oldText={isOldVersion ? line : counterpart}
                    newText={isOldVersion ? counterpart : line}
                    isOldVersion={isOldVersion}
                  />
                ) : (
                  line
                )}
              </span>
            </div>
          );
        });
      })}
    </div>
  );
}

function ChangedText(props: { oldText: string; newText: string; isOldVersion: boolean }) {
  const { oldText, newText } = props;
  return isSingleLine(oldText) && isSingleLine(newText) ? (
    <TextDiff {...props} />
  ) : (
    <MultiLineDiff {...props} />
  );
}

function TextRenderer({
  text,
  oldText,
  newText,
  hasChanges,
  isOldVersion,
  prose
}: {
  text: string;
  oldText: string;
  newText: string;
  hasChanges: boolean;
  isOldVersion: boolean;
  prose?: boolean;
}) {
  if (!text) return <None />;
  return (
    <div
      className={styles.box}
      data-variant={diffVariant(hasChanges, isOldVersion)}
      data-prose={prose || undefined}
    >
      {hasChanges ? (
        <ChangedText oldText={oldText} newText={newText} isOldVersion={isOldVersion} />
      ) : (
        text
      )}
    </div>
  );
}

function InlineDiff({
  oldText,
  newText,
  isOldVersion,
  hasChanges
}: {
  oldText: string;
  newText: string;
  isOldVersion: boolean;
  hasChanges: boolean;
}) {
  if (!hasChanges) return <span>{isOldVersion ? oldText : newText}</span>;
  return (
    <span className={isOldVersion ? styles.removed : styles.added}>
      {isOldVersion ? oldText : newText}
    </span>
  );
}

function SecretValue({
  value,
  isHidden,
  isOldVersion,
  oldValue,
  newValue,
  hasChanges
}: {
  value?: string;
  isHidden?: boolean;
  isOldVersion: boolean;
  oldValue: string;
  newValue: string;
  hasChanges: boolean;
}) {
  const [visible, setVisible] = useState(false);
  if (!value && !isHidden) return <None />;
  let body: ReactNode = <span className={styles.masked}>{MASK}</span>;
  if (visible && !isHidden)
    body = hasChanges ? (
      <ChangedText oldText={oldValue} newText={newValue} isOldVersion={isOldVersion} />
    ) : (
      value
    );
  return (
    <div className={styles.box} data-variant={diffVariant(hasChanges, isOldVersion)} data-action>
      {body}
      <span className={styles.boxAction}>
        {isHidden ? (
          <Tooltip
            content={`You do not have access to view the ${
              isOldVersion ? "old" : "new"
            } secret value.`}
          >
            <span className={styles.hiddenMark}>
              <Icon icon={EyeOffIcon} size={14} label="Value hidden" />
            </span>
          </Tooltip>
        ) : (
          <ActionButton
            label={visible ? "Hide value" : "Reveal value"}
            name="eye"
            onClick={() => setVisible(!visible)}
          />
        )}
      </span>
    </div>
  );
}

function TagsDiff({
  tags,
  otherTags,
  isOldVersion
}: {
  tags?: SecretVersionData["tags"];
  otherTags?: SecretVersionData["tags"];
  isOldVersion: boolean;
}) {
  if (!tags?.length) return <None />;
  const others = new Set(otherTags?.map((tag) => tag.slug));
  return (
    <div className={styles.chips}>
      {tags.map(({ slug }) => {
        let tone: "bad" | "ok" | "outline" = "outline";
        if (!others.has(slug)) tone = isOldVersion ? "bad" : "ok";
        return (
          <Badge key={slug} tone={tone}>
            {slug}
          </Badge>
        );
      })}
    </div>
  );
}

function MetadataDiff({
  metadata,
  otherMetadata,
  isOldVersion
}: {
  metadata?: SecretVersionData["secretMetadata"];
  otherMetadata?: SecretVersionData["secretMetadata"];
  isOldVersion: boolean;
}) {
  if (!metadata?.length) return <None />;
  const byKey = new Map(otherMetadata?.map((entry) => [entry.key, entry]));
  const keyByValue = new Map(otherMetadata?.map((entry) => [entry.value, entry.key]));
  const tone = isOldVersion ? "bad" : "ok";
  return (
    <div className={styles.chips}>
      {metadata.map((entry) => {
        const other = byKey.get(entry.key);
        const renamed =
          !other && keyByValue.has(entry.value) && keyByValue.get(entry.value) !== entry.key;
        const isNew = !other && !renamed;
        const encryptionChanged = Boolean(other) && entry.isEncrypted !== other?.isEncrypted;
        const keyChanged = isNew || renamed || encryptionChanged;
        const valueChanged =
          isNew || (other !== undefined && other.value !== entry.value) || encryptionChanged;
        return (
          <span key={entry.key} className={styles.pair}>
            <Badge tone={keyChanged ? tone : "soft"}>
              {entry.isEncrypted && (
                <Tooltip content="This value is encrypted">
                  <span className={styles.hiddenMark}>
                    <Icon name="lock" size={12} label="Encrypted" />
                  </span>
                </Tooltip>
              )}
              <Tooltip content={entry.key}>
                <span className={styles.chipText}>{entry.key}</span>
              </Tooltip>
            </Badge>
            <Badge tone={valueChanged ? tone : "outline"}>
              <Tooltip content={entry.value || undefined}>
                <span className={styles.chipText}>{entry.value}</span>
              </Tooltip>
            </Badge>
          </span>
        );
      })}
    </div>
  );
}

export type DiffPaneField = {
  key: string;
  label: string;
  hasChanges: boolean;
  previous: ReactNode;
  next: ReactNode;
};

export function DiffPanes({
  operationType,
  fields,
  resourceLabel,
  showChangedMarkers,
  previousEmptyMessage,
  nextEmptyMessage,
  newPaneBadge
}: {
  operationType: ResourceOperationType;
  fields: DiffPaneField[];
  resourceLabel: string;
  showChangedMarkers?: boolean;
  previousEmptyMessage: string;
  nextEmptyMessage: string;
  newPaneBadge?: ReactNode;
}) {
  const renderFields = (side: "previous" | "next") => {
    if (!fields.length) return <span className={styles.none}>No property changes.</span>;
    return fields.map((field) => (
      <div key={field.key} className={styles.field}>
        <span className={styles.fieldLabel}>
          {field.label}
          {showChangedMarkers && field.hasChanges && (
            <Badge tone="warn" size="sm">
              Changed
            </Badge>
          )}
        </span>
        {field[side]}
      </div>
    ));
  };
  return (
    <div className={styles.panes}>
      <div className={styles.paneRow}>
        {operationType === "create" ? (
          <div className={styles.emptyPane}>{previousEmptyMessage}</div>
        ) : (
          <div className={styles.pane} data-side="previous">
            <div className={styles.paneHead}>
              <span className={styles.paneTitle}>{`Previous ${resourceLabel}`}</span>
              <Badge tone="bad">
                <Icon icon={CircleXIcon} size={12} />
                Previous
              </Badge>
            </div>
            {renderFields("previous")}
          </div>
        )}
        {operationType === "delete" ? (
          <div className={styles.emptyPane}>{nextEmptyMessage}</div>
        ) : (
          <div className={styles.pane} data-side="next">
            <div className={styles.paneHead}>
              <span className={styles.paneTitle}>{`New ${resourceLabel}`}</span>
              <span className={styles.paneBadges}>
                {newPaneBadge}
                <Badge tone="ok">
                  <Icon icon={CircleCheckIcon} size={12} />
                  New
                </Badge>
              </span>
            </div>
            {renderFields("next")}
          </div>
        )}
      </div>
    </div>
  );
}

type SecretDiffViewProps = {
  operationType: ResourceOperationType;
  oldVersion?: SecretVersionData;
  newVersion?: SecretVersionData;
  resourceLabel?: string;
  showChangedMarkers?: boolean;
  visibleFields?: SecretFieldKey[];
};

export function SecretDiffView({
  operationType,
  oldVersion,
  newVersion,
  resourceLabel = "secret",
  showChangedMarkers,
  visibleFields = SECRET_FIELD_ORDER
}: SecretDiffViewProps) {
  const changes = getSecretFieldChanges(oldVersion, newVersion);
  const oldKey = oldVersion?.secretKey ?? "";
  const newKey = newVersion?.secretKey ?? "";
  const oldValue = oldVersion?.secretValue ?? "";
  const newValue = newVersion?.secretValue ?? oldVersion?.secretValue ?? "";
  const oldComment = oldVersion?.secretComment ?? "";
  const newComment = newVersion?.secretComment ?? "";
  const oldMultiline = String(oldVersion?.skipMultilineEncoding ?? false);
  const newMultiline = String(newVersion?.skipMultilineEncoding ?? false);
  const side = (isOldVersion: boolean) => {
    const version = isOldVersion ? oldVersion : newVersion;
    return {
      secretKey: (
        <TextRenderer
          text={isOldVersion ? oldKey : newKey}
          oldText={oldKey}
          newText={newKey}
          hasChanges={changes.secretKey}
          isOldVersion={isOldVersion}
        />
      ),
      secretValue: (
        <SecretValue
          value={version?.secretValue}
          isHidden={version?.secretValueHidden}
          isOldVersion={isOldVersion}
          oldValue={oldValue}
          newValue={newValue}
          hasChanges={changes.secretValue}
        />
      ),
      secretComment: (
        <TextRenderer
          prose
          text={isOldVersion ? oldComment : newComment}
          oldText={oldComment}
          newText={newComment}
          hasChanges={changes.secretComment}
          isOldVersion={isOldVersion}
        />
      ),
      tags: (
        <TagsDiff
          tags={version?.tags}
          otherTags={(isOldVersion ? newVersion : oldVersion)?.tags}
          isOldVersion={isOldVersion}
        />
      ),
      secretMetadata: (
        <MetadataDiff
          metadata={version?.secretMetadata}
          otherMetadata={(isOldVersion ? newVersion : oldVersion)?.secretMetadata}
          isOldVersion={isOldVersion}
        />
      ),
      skipMultilineEncoding: (
        <InlineDiff
          oldText={oldMultiline}
          newText={newMultiline}
          isOldVersion={isOldVersion}
          hasChanges={changes.skipMultilineEncoding}
        />
      )
    };
  };
  const previous = side(true);
  const next = side(false);
  return (
    <DiffPanes
      operationType={operationType}
      fields={visibleFields.map((key) => ({
        key,
        label: SECRET_FIELD_LABELS[key],
        hasChanges: changes[key],
        previous: previous[key],
        next: next[key]
      }))}
      resourceLabel={resourceLabel}
      showChangedMarkers={showChangedMarkers}
      previousEmptyMessage="Secret did not exist in the previous version."
      nextEmptyMessage="Secret will be deleted."
      newPaneBadge={
        newVersion?.isRedacted && (
          <Tooltip
            wrap
            content="This secret version has been redacted. Rolling back to this version will result in an empty secret value."
          >
            <Badge tone="bad">
              <Icon name="alert" size={12} />
              Redacted version
            </Badge>
          </Tooltip>
        )
      }
    />
  );
}

type FolderDiffViewProps = {
  operationType: ResourceOperationType;
  oldVersion?: FolderVersionData;
  newVersion?: FolderVersionData;
  resourceLabel?: string;
  showChangedMarkers?: boolean;
  visibleFields?: FolderFieldKey[];
};

export function FolderDiffView({
  operationType,
  oldVersion,
  newVersion,
  resourceLabel = "folder",
  showChangedMarkers,
  visibleFields = FOLDER_FIELD_ORDER
}: FolderDiffViewProps) {
  const changes = getFolderFieldChanges(oldVersion, newVersion);
  const values = {
    name: [oldVersion?.name ?? "", newVersion?.name ?? ""],
    description: [oldVersion?.description ?? "", newVersion?.description ?? ""]
  };
  const render = (key: FolderFieldKey, isOldVersion: boolean) => (
    <TextRenderer
      prose={key === "description"}
      text={values[key][isOldVersion ? 0 : 1]}
      oldText={values[key][0]}
      newText={values[key][1]}
      hasChanges={changes[key]}
      isOldVersion={isOldVersion}
    />
  );
  return (
    <DiffPanes
      operationType={operationType}
      fields={visibleFields.map((key) => ({
        key,
        label: FOLDER_FIELD_LABELS[key],
        hasChanges: changes[key],
        previous: render(key, true),
        next: render(key, false)
      }))}
      resourceLabel={resourceLabel}
      showChangedMarkers={showChangedMarkers}
      previousEmptyMessage="Folder did not exist in the previous version."
      nextEmptyMessage="Folder will be deleted."
    />
  );
}

export function CompactSecretDiffView(props: Omit<SecretDiffViewProps, "visibleFields">) {
  const { operationType, oldVersion, newVersion } = props;
  const { visibleKeys } = summarizeCompactFields({
    operationType,
    fieldOrder: SECRET_FIELD_ORDER,
    identityField: SECRET_IDENTITY_FIELD,
    changes: getSecretFieldChanges(oldVersion, newVersion),
    populated: getSecretPopulatedFields(operationType === "delete" ? oldVersion : newVersion)
  });
  return <SecretDiffView {...props} visibleFields={visibleKeys} />;
}

export function CompactFolderDiffView(props: Omit<FolderDiffViewProps, "visibleFields">) {
  const { operationType, oldVersion, newVersion } = props;
  const { visibleKeys } = summarizeCompactFields({
    operationType,
    fieldOrder: FOLDER_FIELD_ORDER,
    identityField: FOLDER_IDENTITY_FIELD,
    changes: getFolderFieldChanges(oldVersion, newVersion),
    populated: getFolderPopulatedFields(operationType === "delete" ? oldVersion : newVersion)
  });
  return <FolderDiffView {...props} visibleFields={visibleKeys} />;
}

export type Version = {
  id?: string;
  version: number;
  isRedacted?: boolean;
  [key: string]: unknown;
};

export type DiffViewItem = {
  type: "secret" | "folder";
  isAdded?: boolean;
  isDeleted?: boolean;
  isUpdated?: boolean;
  versions?: Version[];
  isRollback?: boolean;
  id: string;
  secretKey?: string;
  folderName?: string;
};

const toSecretData = (version?: Version): SecretVersionData | undefined => {
  if (!version) return undefined;
  const tags = Array.isArray(version.tags)
    ? (version.tags as Array<{ slug?: string; color?: string } | string>).map((tag) =>
        typeof tag === "string"
          ? { slug: tag, color: "" }
          : { slug: tag.slug ?? "", color: tag.color ?? "" }
      )
    : undefined;
  return {
    isRedacted: version.isRedacted,
    secretKey: version.secretKey as string | undefined,
    secretValue: version.secretValue as string | undefined,
    secretValueHidden: version.secretValueHidden as boolean | undefined,
    secretComment: version.comment as string | undefined,
    tags,
    secretMetadata: (version.metadata ??
      version.secretMetadata) as SecretVersionData["secretMetadata"],
    skipMultilineEncoding: version.skipMultilineEncoding as boolean | undefined
  };
};

const toFolderData = (version?: Version): FolderVersionData | undefined =>
  version && {
    name: version.name as string | undefined,
    description: version.description as string | undefined
  };

export function SecretVersionDiffView({
  item,
  isCollapsed = false,
  onToggleCollapse,
  showHeader = true,
  showViewed = false,
  customHeader,
  onDiscard,
  headerExtra
}: {
  item: DiffViewItem;
  isCollapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
  showHeader?: boolean;
  showViewed?: boolean;
  customHeader?: ReactNode;
  onDiscard?: () => void;
  headerExtra?: ReactNode;
}) {
  const [viewed, setViewed] = useState(false);
  const [internalValue, setInternalValue] = useState(isCollapsed ? "" : item.id);
  if (!item.versions?.length) return <div className={styles.noDetails}>No details available</div>;
  const sorted = [...item.versions].sort((a, b) => b.version - a.version);
  let oldVersion: Version | undefined;
  let newVersion: Version | undefined;
  let operationType: ResourceOperationType = "update";
  if (item.isAdded) operationType = "create";
  else if (item.isDeleted) operationType = "delete";
  if (item.isUpdated && sorted.length >= 2) {
    [oldVersion, newVersion] = item.isRollback ? sorted : [sorted[1], sorted[0]];
  } else if (item.isAdded) {
    [newVersion] = sorted;
  } else if (item.isDeleted) {
    [oldVersion] = sorted;
  } else {
    return null;
  }
  const isSecret = item.type === "secret";
  const name = isSecret ? item.secretKey || "Unnamed secret" : item.folderName || "Unnamed folder";
  let badge: { tone: "bad" | "ok" | "warn"; label: string } | undefined;
  if (item.isDeleted) badge = { tone: "bad", label: "Deleted" };
  else if (item.isAdded) badge = { tone: "ok", label: "Added" };
  else if (item.isUpdated) badge = { tone: "warn", label: "Updated" };
  const expanded = onToggleCollapse ? !isCollapsed : internalValue === item.id;
  const setExpanded = (open: boolean) => {
    if (onToggleCollapse) {
      if (open === isCollapsed) onToggleCollapse(item.id);
    } else setInternalValue(open ? item.id : "");
  };
  return (
    <Accordion
      type="single"
      collapsible
      value={expanded ? item.id : ""}
      onValueChange={(value) => setExpanded(value === item.id)}
    >
      <AccordionItem value={item.id} className={styles.card} data-viewed={viewed || undefined}>
        {showHeader && (
          <div className={styles.cardHead}>
            <AccordionTrigger>
              {customHeader ?? (
                <span className={styles.cardTitle}>
                  <Icon
                    name={isSecret ? "key" : "folder"}
                    size={16}
                    className={styles.secretIcon}
                  />
                  <span className={styles.cardName} data-deleted={item.isDeleted || undefined}>
                    {name}
                  </span>
                  {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
                </span>
              )}
            </AccordionTrigger>
            {!customHeader && headerExtra}
            {!customHeader && showViewed && (
              <span className={styles.viewed}>
                <Checkbox
                  label="Viewed"
                  checked={viewed}
                  onChange={(checked) => {
                    setViewed(checked);
                    setExpanded(!checked);
                  }}
                />
              </span>
            )}
            {!customHeader && onDiscard && (
              <ActionButton label="Discard change" name="trash" onClick={onDiscard} />
            )}
          </div>
        )}
        <AccordionContent className={styles.accordionBody}>
          <div className={styles.cardBody}>
            {isSecret ? (
              <SecretDiffView
                operationType={operationType}
                oldVersion={toSecretData(oldVersion)}
                newVersion={toSecretData(newVersion)}
              />
            ) : (
              <FolderDiffView
                operationType={operationType}
                oldVersion={toFolderData(oldVersion)}
                newVersion={toFolderData(newVersion)}
              />
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
