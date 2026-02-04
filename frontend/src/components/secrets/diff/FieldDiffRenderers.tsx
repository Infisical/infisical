import { faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { computeWordDiff } from "@app/components/utilities/diff";
import { Tag, Tooltip } from "@app/components/v2";

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
    const bgClass = isOldVersion ? "bg-red-600/40" : "bg-green-600/40";
    return (
      <span className={twMerge("rounded-sm px-0.5", baseClass, fontSizeClass, bgClass)}>
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
            <span key={key} className="rounded-sm bg-green-600/40 px-0.5">
              {change.value}
            </span>
          );
        }
        if (change.removed && isOldVersion) {
          return (
            <span key={key} className="rounded-sm bg-red-600/40 px-0.5">
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
    return <span className="text-sm text-mineshaft-300">-</span>;
  }

  const otherTagSlugs = new Set(otherTags?.map((t) => t.slug) ?? []);

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(({ slug, color }) => {
        const isInOther = otherTagSlugs.has(slug);
        const isRemoved = isOldVersion && !isInOther;
        const isAdded = !isOldVersion && !isInOther;

        return (
          <Tag
            className={twMerge(
              "flex w-min items-center space-x-1.5 border bg-mineshaft-800",
              isRemoved && "border-red-500/60 bg-red-600/20",
              isAdded && "border-green-500/60 bg-green-600/20",
              !isRemoved && !isAdded && "border-mineshaft-500"
            )}
            key={slug}
          >
            {color && <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />}
            <div className="text-sm">{slug}</div>
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
  metadata?: Array<{ key: string; value: string }>;
  otherMetadata?: Array<{ key: string; value: string }>;
  isOldVersion: boolean;
}) => {
  if (!metadata?.length) {
    return <p className="text-sm text-mineshaft-300">-</p>;
  }

  const otherMetaByKey = new Map(otherMetadata?.map((m) => [m.key, m.value]) ?? []);
  const otherMetaByValue = new Map(otherMetadata?.map((m) => [m.value, m.key]) ?? []);

  return (
    <div className="mt-1 flex flex-wrap gap-2 text-sm text-mineshaft-300">
      {metadata.map((el) => {
        const keyExistsInOther = otherMetaByKey.has(el.key);
        const otherValueForKey = otherMetaByKey.get(el.key);

        const valueExistsWithDifferentKey =
          !keyExistsInOther &&
          otherMetaByValue.has(el.value) &&
          otherMetaByValue.get(el.value) !== el.key;

        const isEntirelyNew = !isOldVersion && !keyExistsInOther && !valueExistsWithDifferentKey;
        const isEntirelyRemoved = isOldVersion && !keyExistsInOther && !valueExistsWithDifferentKey;
        const isValueChanged = keyExistsInOther && otherValueForKey !== el.value;
        const isKeyRenamed = valueExistsWithDifferentKey;

        const keyHighlighted = isEntirelyNew || isEntirelyRemoved || isKeyRenamed;
        const valueHighlighted = isEntirelyNew || isEntirelyRemoved || isValueChanged;

        const hasAnyChange = keyHighlighted || valueHighlighted;
        const borderColorClass = isOldVersion ? "border-red-500/60" : "border-green-500/60";
        const borderClass = twMerge(
          "border",
          hasAnyChange && borderColorClass,
          !hasAnyChange && "border-mineshaft-500"
        );

        // Key: grey background with colored ring if changed
        const keyBgClass = twMerge(
          "bg-mineshaft-500",
          keyHighlighted &&
            (isOldVersion
              ? "bg-red-500/30 ring-1 ring-red-500/60 ring-inset"
              : "bg-green-500/30 ring-1 ring-green-500/60 ring-inset")
        );

        // Value: color background if changed
        const valueBgClass = twMerge(
          valueHighlighted && (isOldVersion ? "bg-red-900/30" : "bg-green-900/30"),
          !valueHighlighted && "bg-mineshaft-900"
        );

        return (
          <div key={el.key} className="flex items-center">
            <Tag
              size="xs"
              className={twMerge("mr-0 flex items-center rounded-r-none", borderClass, keyBgClass)}
            >
              <FontAwesomeIcon icon={faKey} size="xs" className="mr-1" />
              <Tooltip className="max-w-lg break-words whitespace-normal" content={el.key}>
                <div className="max-w-[125px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {el.key}
                </div>
              </Tooltip>
            </Tag>
            <Tag
              size="xs"
              className={twMerge(
                "flex items-center rounded-l-none pl-1",
                borderClass,
                valueBgClass
              )}
            >
              <Tooltip className="max-w-lg break-words whitespace-normal" content={el.value}>
                <div className="max-w-[125px] overflow-hidden text-ellipsis whitespace-nowrap">
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
