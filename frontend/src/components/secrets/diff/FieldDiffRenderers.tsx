import { LockIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { computeWordDiff, isSingleLine } from "@app/components/utilities/diff";
import { Badge, ButtonGroup, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

import { DiffContainer } from "./DiffContainer";
import { MultiLineDiff } from "./MultiLineDiff";
import { SingleLineDiff } from "./SingleLineDiff";

export const DiffFieldLabel = ({
  label,
  hasChanges,
  showChangedMarker
}: {
  label: string;
  hasChanges: boolean;
  showChangedMarker?: boolean;
}) => (
  <div className="mb-0.5 flex items-center gap-1 text-xs font-medium text-label">
    {label}
    {showChangedMarker && hasChanges && (
      <Badge
        variant="warning"
        className="min-h-3 px-1 py-0 text-[9px] leading-3 tracking-wide uppercase"
      >
        Changed
      </Badge>
    )}
  </div>
);

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
        let variant: "danger" | "success" | "outline" = "outline";
        if (isRemoved) variant = "danger";
        else if (isAdded) variant = "success";

        return (
          <Badge key={slug} variant={variant}>
            {color && <span className="size-3 rounded-full" style={{ backgroundColor: color }} />}
            {slug}
          </Badge>
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
    <div className="mt-1 flex flex-wrap gap-1.5 text-sm text-label">
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

        const keyHighlighted =
          isEntirelyNew || isEntirelyRemoved || isKeyRenamed || encryptionChanged;
        const valueHighlighted =
          isEntirelyNew || isEntirelyRemoved || isValueChanged || encryptionChanged;

        const diffVariant = isOldVersion ? "danger" : "success";

        let lockIconClass: string | undefined;
        if (encryptionTurnedOff) lockIconClass = "text-danger";
        else if (encryptionTurnedOn) lockIconClass = "text-success";

        return (
          <ButtonGroup key={el.key} className="max-w-full min-w-0">
            <Badge
              variant={keyHighlighted ? diffVariant : "default"}
              isTruncatable
              className="max-w-[125px]"
            >
              {el.isEncrypted && (
                <Tooltip hoverable delayDuration={50}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <LockIcon className={lockIconClass} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>This value is encrypted</TooltipContent>
                </Tooltip>
              )}
              <Tooltip hoverable delayDuration={50}>
                <TooltipTrigger asChild>
                  <span>{el.key}</span>
                </TooltipTrigger>
                <TooltipContent className="max-w-lg break-words whitespace-normal">
                  {el.key}
                </TooltipContent>
              </Tooltip>
            </Badge>
            <Badge
              variant={valueHighlighted ? diffVariant : "outline"}
              isTruncatable
              className="max-w-[125px]"
            >
              {el.value && (
                <Tooltip hoverable delayDuration={50}>
                  <TooltipTrigger asChild>
                    <span>{el.value}</span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-lg break-words whitespace-normal">
                    {el.value}
                  </TooltipContent>
                </Tooltip>
              )}
            </Badge>
          </ButtonGroup>
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
  containerRef?: React.RefObject<HTMLDivElement | null>;
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
