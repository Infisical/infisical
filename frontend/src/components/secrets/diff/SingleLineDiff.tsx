import { diffChars } from "diff";

import { computeWordDiff } from "@app/components/utilities/diff";

export interface SingleLineDiffProps {
  oldText: string;
  newText: string;
  isOldVersion: boolean;
}

/**
 * Render single-line diff (just word highlighting, no container/+/-)
 */
export const SingleLineDiff = ({ oldText, newText, isOldVersion }: SingleLineDiffProps) => {
  // Check if old text is contained within new text (pure insertion - append, prepend, or middle)
  const oldExistsInNew = oldText !== "" && newText !== "" && newText.includes(oldText);

  if (oldExistsInNew) {
    const startIndex = newText.indexOf(oldText);
    const endIndex = startIndex + oldText.length;

    const prependPart = newText.slice(0, startIndex);
    const appendPart = newText.slice(endIndex);

    if (isOldVersion) {
      return (
        <div className="font-mono text-sm break-words">
          <span>{oldText}</span>
        </div>
      );
    }

    return (
      <div className="font-mono text-sm break-words">
        {prependPart && <span className="rounded bg-green-600/70 px-0.5">{prependPart}</span>}
        <span>{oldText}</span>
        {appendPart && <span className="rounded bg-green-600/70 px-0.5">{appendPart}</span>}
      </div>
    );
  }

  // Check if new text is contained within old text (pure deletion)
  const newExistsInOld = oldText !== "" && newText !== "" && oldText.includes(newText);

  if (newExistsInOld) {
    const startIndex = oldText.indexOf(newText);
    const endIndex = startIndex + newText.length;

    const removedPrefix = oldText.slice(0, startIndex);
    const removedSuffix = oldText.slice(endIndex);

    if (isOldVersion) {
      return (
        <div className="font-mono text-sm break-words">
          {removedPrefix && <span className="rounded bg-red-600/70 px-0.5">{removedPrefix}</span>}
          <span>{newText}</span>
          {removedSuffix && <span className="rounded bg-red-600/70 px-0.5">{removedSuffix}</span>}
        </div>
      );
    }

    return (
      <div className="font-mono text-sm break-words">
        <span>{newText}</span>
      </div>
    );
  }

  // For mixed changes (both insertions and deletions), use character diff
  // but only apply special handling for pure insertions
  const charDiffs = diffChars(oldText, newText);
  const hasRemovals = charDiffs.some((d) => d.removed);
  const hasAdditions = charDiffs.some((d) => d.added);

  // Pure insertion case (no removals): don't highlight old version
  if (!hasRemovals && hasAdditions) {
    if (isOldVersion) {
      return (
        <div className="font-mono text-sm break-words">
          <span>{oldText}</span>
        </div>
      );
    }
    // Show new version with character-level highlighting
    return (
      <div className="font-mono text-sm break-words">
        {charDiffs.map((change, idx) => {
          if (change.removed) return null;
          const key = `char-${idx}`;
          const className = change.added ? "bg-green-600/70 rounded px-0.5" : "";
          return (
            <span key={key} className={className}>
              {change.value}
            </span>
          );
        })}
      </div>
    );
  }

  // Pure deletion case (no additions): don't highlight new version
  if (hasRemovals && !hasAdditions) {
    if (!isOldVersion) {
      return (
        <div className="font-mono text-sm break-words">
          <span>{newText}</span>
        </div>
      );
    }
    // Show old version with character-level highlighting
    return (
      <div className="font-mono text-sm break-words">
        {charDiffs.map((change, idx) => {
          if (change.added) return null;
          const key = `char-${idx}`;
          const className = change.removed ? "bg-red-600/70 rounded px-0.5" : "";
          return (
            <span key={key} className={className}>
              {change.value}
            </span>
          );
        })}
      </div>
    );
  }

  // Mixed changes: fall back to word-level diff (more readable for humans)
  const wordDiffs = computeWordDiff(oldText, newText);

  // If no common words, show as single highlighted block
  if (!wordDiffs) {
    const value = isOldVersion ? oldText : newText;
    const highlightClass = isOldVersion
      ? "bg-red-600/70 rounded px-0.5"
      : "bg-green-600/70 rounded px-0.5";
    return (
      <div className="font-mono text-sm break-words">
        <span className={highlightClass}>{value}</span>
      </div>
    );
  }

  // Show word-by-word diff
  return (
    <div className="font-mono text-sm break-words">
      {wordDiffs.map((change, wordIdx) => {
        if (isOldVersion && change.added) return null;
        if (!isOldVersion && change.removed) return null;

        const wordKey = `word-${wordIdx}`;
        let wordClass = "";
        if (change.removed) {
          wordClass = "bg-red-600/70 rounded px-0.5";
        } else if (change.added) {
          wordClass = "bg-green-600/70 rounded px-0.5";
        }

        return (
          <span key={wordKey} className={wordClass}>
            {change.value}
          </span>
        );
      })}
    </div>
  );
};
