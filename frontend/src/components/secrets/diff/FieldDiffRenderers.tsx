import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { computeWordDiff, isSingleLine } from "@app/components/utilities/diff";
import { Tag, Tooltip } from "@app/components/v2";

import { DiffContainer } from "./DiffContainer";
import { MultiLineDiff } from "./MultiLineDiff";
import { SingleLineDiff } from "./SingleLineDiff";

// Inline text diff renderer (for Key, Comment, Multi-line Encoding)
export const InlineTextDiff = ({
  oldText,
  newText,
  isOldVersion,
  hasChanges,
  preserveWhitespace = false,
  fontSize = "base"
}: {
  oldText: string;
  newText: string;
  isOldVersion: boolean;
  hasChanges: boolean;
  preserveWhitespace?: boolean;
  fontSize?: "sm" | "base";
}) => {
  const baseClass = preserveWhitespace ? "whitespace-pre-wrap" : "";
  const fontSizeClass = fontSize === "sm" ? "text-sm" : "text-base";

  if (!hasChanges) {
    return (
      <span className={twMerge(baseClass, fontSizeClass)}>{isOldVersion ? oldText : newText}</span>
    );
  }

  const changes = computeWordDiff(oldText, newText);

  // If no common words (null), highlight the entire text
  if (!changes) {
    const text = isOldVersion ? oldText : newText;
    const bgClass = isOldVersion ? "bg-danger/40" : "bg-success/40";
    return (
      <span className={twMerge("rounded-[2px] px-0.5", baseClass, fontSizeClass, bgClass)}>
        {text}
      </span>
    );
  }

  return (
    <span className={twMerge(baseClass, fontSizeClass)}>
      {changes.map((change, index) => {
        let keyPrefix = "unchanged";
        if (change.added) keyPrefix = "add";
        else if (change.removed) keyPrefix = "rem";
        const key = `${keyPrefix}-${index}`;

        if (change.added && !isOldVersion) {
          return (
            <span key={key} className="rounded-sm bg-success/40 px-0.5">
              {change.value}
            </span>
          );
        }
        if (change.removed && isOldVersion) {
          return (
            <span key={key} className="rounded-sm bg-danger/40 px-0.5">
              {change.value}
            </span>
          );
        }
        if (!change.added && !change.removed) {
          return <span key={key}>{change.value}</span>;
        }
        return null;
      })}
    </span>
  );
};

// Render tags with diff highlighting (string[] version - no color dots)
export const TagsDiffRenderer = ({
  tags,
  otherTags,
  isOldVersion
}: {
  tags?: Array<{ slug: string; color: string }>;
  otherTags?: Array<{ slug: string; color: string }>;
  isOldVersion: boolean;
}) => {
  if (!tags?.length) {
    return <span className="text-sm text-muted">&mdash;</span>;
  }

  const otherTagSlugs = new Set(otherTags?.map((t) => t.slug) ?? []);

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map(({ slug, color }) => {
        const isInOther = otherTagSlugs.has(slug);
        const isRemoved = isOldVersion && !isInOther;
        const isAdded = !isOldVersion && !isInOther;

        return (
          <Tag
            className={twMerge(
              "mr-0 flex w-min items-center space-x-1.5 rounded border bg-mineshaft-900/60 py-0.5 text-xs",
              isRemoved && "border-danger/35 bg-danger/20",
              isAdded && "border-success/35 bg-success/20",
              !isRemoved && !isAdded && "border-border"
            )}
            key={slug}
          >
            {color && <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />}
            <div className="text-xs text-foreground">{slug}</div>
          </Tag>
        );
      })}
    </div>
  );
};

// Render metadata with diff highlighting (granular key/value coloring)
export const MetadataDiffRenderer = ({
  metadata,
  otherMetadata,
  isOldVersion
}: {
  metadata?: Array<{ key: string; value: string; isEncrypted?: boolean }>;
  otherMetadata?: Array<{ key: string; value: string; isEncrypted?: boolean }>;
  isOldVersion: boolean;
}) => {
  if (!metadata?.length) {
    return <p className="text-sm text-muted">&mdash;</p>;
  }

  const otherMetaByKey = new Map(
    otherMetadata?.map((m) => [m.key, { value: m.value, isEncrypted: m.isEncrypted }]) ?? []
  );
  const otherMetaByValue = new Map(otherMetadata?.map((m) => [m.value, m.key]) ?? []);

  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-sm text-mineshaft-300">
      {metadata.map((el) => {
        const keyExistsInOther = otherMetaByKey.has(el.key);
        const otherDataForKey = otherMetaByKey.get(el.key);
        const otherValueForKey = otherDataForKey?.value;
        const otherIsEncrypted = otherDataForKey?.isEncrypted;

        const valueExistsWithDifferentKey =
          !keyExistsInOther &&
          otherMetaByValue.has(el.value) &&
          otherMetaByValue.get(el.value) !== el.key;

        const isEntirelyNew = !isOldVersion && !keyExistsInOther && !valueExistsWithDifferentKey;
        const isEntirelyRemoved = isOldVersion && !keyExistsInOther && !valueExistsWithDifferentKey;
        const isValueChanged = keyExistsInOther && otherValueForKey !== el.value;
        const isKeyRenamed = valueExistsWithDifferentKey;

        const encryptionChanged = keyExistsInOther && el.isEncrypted !== otherIsEncrypted;
        const encryptionTurnedOff = encryptionChanged && isOldVersion && el.isEncrypted === true;
        const encryptionTurnedOn = encryptionChanged && !isOldVersion && el.isEncrypted === true;

        const keyHighlighted = isEntirelyNew || isEntirelyRemoved || isKeyRenamed;
        const valueHighlighted = isEntirelyNew || isEntirelyRemoved || isValueChanged;

        const hasAnyChange = keyHighlighted || valueHighlighted || encryptionChanged;
        const borderColorClass = isOldVersion ? "border-danger/35" : "border-success/35";
        const borderClass = twMerge(
          "border",
          hasAnyChange && borderColorClass,
          !hasAnyChange && "border-border"
        );

        const keyBgClass = twMerge(
          "bg-muted/40",
          keyHighlighted && (isOldVersion ? "bg-danger/30" : "bg-success/30")
        );

        const valueBgClass = twMerge(
          valueHighlighted && (isOldVersion ? "bg-danger/30" : "bg-success/30"),
          !valueHighlighted && "bg-mineshaft-900/60"
        );

        const lockIconClass = twMerge(
          "mr-1",
          encryptionTurnedOff && "text-danger",
          encryptionTurnedOn && "text-success",
          !encryptionTurnedOff && !encryptionTurnedOn && "text-foreground"
        );

        return (
          <div key={el.key} className="flex items-center">
            <Tag
              size="xs"
              className={twMerge("mr-0 flex items-center rounded-r-none", borderClass, keyBgClass)}
            >
              {el.isEncrypted && (
                <Tooltip content="This value is encrypted">
                  <FontAwesomeIcon icon={faLock} size="xs" className={lockIconClass} />
                </Tooltip>
              )}
              <Tooltip className="max-w-lg break-words whitespace-normal" content={el.key}>
                <div className="max-w-[125px] overflow-hidden text-ellipsis whitespace-nowrap text-foreground">
                  {el.key}
                </div>
              </Tooltip>
            </Tag>
            <Tag
              size="xs"
              className={twMerge(
                "mr-0 flex items-center !rounded-l-none border-l-0 pl-1",
                borderClass,
                valueBgClass
              )}
            >
              <Tooltip className="max-w-lg break-words whitespace-normal" content={el.value}>
                <div className="max-w-[125px] overflow-hidden text-ellipsis whitespace-nowrap text-foreground">
                  {el.value}
                </div>
              </Tooltip>
            </Tag>
          </div>
        );
      })}
    </div>
  );
};

export const SingleLineTextDiffRenderer = ({
  text,
  oldText,
  newText,
  hasChanges,
  isOldVersion
}: {
  text: string;
  oldText: string;
  newText: string;
  hasChanges: boolean;
  isOldVersion: boolean;
}) => {
  if (!text) {
    return <span className="text-sm text-muted">&mdash;</span>;
  }

  if (!hasChanges) {
    return (
      <DiffContainer isSingleLine>
        <span className="text-sm">{text}</span>
      </DiffContainer>
    );
  }

  const variant = isOldVersion ? "removed" : "added";

  return (
    <DiffContainer variant={variant} isSingleLine>
      <SingleLineDiff oldText={oldText} newText={newText} isOldVersion={isOldVersion} />
    </DiffContainer>
  );
};

export const MultiLineTextDiffRenderer = ({
  text,
  oldText,
  newText,
  hasChanges,
  isOldVersion,
  containerRef
}: {
  text: string;
  oldText: string;
  newText: string;
  hasChanges: boolean;
  isOldVersion: boolean;
  containerRef?: React.RefObject<HTMLDivElement>;
}) => {
  if (!text) {
    return <span className="text-sm text-muted">&mdash;</span>;
  }

  if (!hasChanges) {
    return (
      <DiffContainer containerRef={containerRef}>
        <span className="text-sm whitespace-pre-wrap">{text}</span>
      </DiffContainer>
    );
  }

  const variant = isOldVersion ? "removed" : "added";
  const isBothSingleLine = isSingleLine(oldText) && isSingleLine(newText);

  if (isBothSingleLine) {
    return (
      <DiffContainer variant={variant} isSingleLine>
        <SingleLineDiff oldText={oldText} newText={newText} isOldVersion={isOldVersion} />
      </DiffContainer>
    );
  }

  return (
    <DiffContainer variant={variant} containerRef={containerRef}>
      <MultiLineDiff oldText={oldText} newText={newText} isOldVersion={isOldVersion} />
    </DiffContainer>
  );
};
