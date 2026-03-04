import { computeWordDiff } from "@app/components/utilities/diff";

export interface SingleLineDiffProps {
  oldText: string;
  newText: string;
  isOldVersion: boolean;
}

export interface RenderTextDiffOptions {
  oldText: string;
  newText: string;
  isOldVersion: boolean;
  keyPrefix?: string;
  addedClass?: string;
  removedClass?: string;
}

/**
 * Renders text with highlighted prefix and/or suffix around unchanged content.
 */
const renderWithHighlightedParts = (
  unchangedText: string,
  prefixText: string,
  suffixText: string,
  highlightClass: string
): React.ReactNode => {
  return (
    <>
      {prefixText && <span className={highlightClass}>{prefixText}</span>}
      <span>{unchangedText}</span>
      {suffixText && <span className={highlightClass}>{suffixText}</span>}
    </>
  );
};

/**
 * Core diff rendering logic - returns React nodes for text diff highlighting.
 * Handles pure insertions, pure deletions, and mixed changes.
 * Can be used standalone or wrapped in a container component.
 */
export const renderTextDiff = ({
  oldText,
  newText,
  isOldVersion,
  keyPrefix = "diff",
  addedClass = "rounded bg-green-600/70 px-0.5",
  removedClass = "rounded bg-red-600/70 px-0.5"
}: RenderTextDiffOptions): React.ReactNode => {
  // Check if one text contains the other (pure insertion or deletion)
  const oldExistsInNew = oldText !== "" && newText !== "" && newText.includes(oldText);
  const newExistsInOld = oldText !== "" && newText !== "" && oldText.includes(newText);

  // Pure insertion: old text is fully contained in new text
  if (oldExistsInNew) {
    if (isOldVersion) {
      return <span>{oldText}</span>;
    }
    const startIndex = newText.indexOf(oldText);
    const prependPart = newText.slice(0, startIndex);
    const appendPart = newText.slice(startIndex + oldText.length);
    return renderWithHighlightedParts(oldText, prependPart, appendPart, addedClass);
  }

  // Pure deletion: new text is fully contained in old text
  if (newExistsInOld) {
    if (!isOldVersion) {
      return <span>{newText}</span>;
    }
    const startIndex = oldText.indexOf(newText);
    const removedPrefix = oldText.slice(0, startIndex);
    const removedSuffix = oldText.slice(startIndex + newText.length);
    return renderWithHighlightedParts(newText, removedPrefix, removedSuffix, removedClass);
  }

  // Use word-level diff for better readability
  const wordDiffs = computeWordDiff(oldText, newText);

  // If no common words, show as single highlighted block
  if (!wordDiffs) {
    const value = isOldVersion ? oldText : newText;
    const highlightClass = isOldVersion ? removedClass : addedClass;
    return <span className={highlightClass}>{value}</span>;
  }

  // Show word-by-word diff
  return (
    <>
      {wordDiffs.map((change, wordIdx) => {
        if (isOldVersion && change.added) return null;
        if (!isOldVersion && change.removed) return null;

        const wordKey = `${keyPrefix}-word-${wordIdx}`;
        let wordClass = "";
        if (change.removed) {
          wordClass = removedClass;
        } else if (change.added) {
          wordClass = addedClass;
        }

        return (
          <span key={wordKey} className={wordClass}>
            {change.value}
          </span>
        );
      })}
    </>
  );
};

/**
 * Render single-line diff with container (just word highlighting, no +/-)
 */
export const SingleLineDiff = ({ oldText, newText, isOldVersion }: SingleLineDiffProps) => {
  return (
    <div className="font-mono text-sm break-words">
      {renderTextDiff({ oldText, newText, isOldVersion })}
    </div>
  );
};
