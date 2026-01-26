/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable no-nested-ternary */
import { useEffect, useRef, useState } from "react";
import {
  faCircleCheck,
  faCircleXmark,
  faExclamationTriangle,
  faEye,
  faEyeSlash,
  faInfoCircle,
  faKey
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { SecretInput, Tag, Tooltip } from "@app/components/v2";
import { CommitType, SecretV3Raw, TSecretApprovalSecChange, WsTag } from "@app/hooks/api/types";
import { useRenderNewVersionDiffLine } from "@app/hooks/useRenderNewVersionDiffLine";

// ===== MULTILINE DIFF FUNCTIONS =====
const DIFF_TYPE = {
  ADDED: "added",
  DELETED: "deleted",
  UNCHANGED: "unchanged",
  MODIFIED: "modified"
} as const;

// Normalize secret value to match backend behavior:
// - Trim whitespace
// - If value ends with \n, preserve it (but trim everything else)
// This matches the backend transform: (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim())
const normalizeSecretValue = (value: string | null | undefined): string => {
  if (!value || typeof value !== "string") return "";
  // If value ends with \n, preserve it after trimming
  if (value.at(-1) === "\n") {
    return `${value.trim()}\n`;
  }
  return value.trim();
};

// Compare normalized values to determine if they're actually different
const areValuesEqual = (
  oldValue: string | null | undefined,
  newValue: string | null | undefined
): boolean => {
  const normalizedOld = normalizeSecretValue(oldValue);
  const normalizedNew = normalizeSecretValue(newValue);
  return normalizedOld === normalizedNew;
};

const isSingleLine = (str: string | null | undefined): boolean => {
  if (!str || typeof str !== "string") return true;
  return !str.includes("\n");
};

type DiffLine = {
  type: (typeof DIFF_TYPE)[keyof typeof DIFF_TYPE];
  oldLine?: string;
  newLine?: string;
};

type WordDiff = {
  type: typeof DIFF_TYPE.ADDED | typeof DIFF_TYPE.DELETED | typeof DIFF_TYPE.UNCHANGED;
  text: string;
};

// Simple line-by-line diff algorithm
// Normalizes lines by trimming trailing whitespace before comparison
const computeLineDiff = (oldText: string, newText: string): DiffLine[] => {
  // Normalize the texts before splitting
  const normalizedOld = normalizeSecretValue(oldText);
  const normalizedNew = normalizeSecretValue(newText);

  const oldLines = normalizedOld.split("\n");
  const newLines = normalizedNew.split("\n");
  const result: DiffLine[] = [];

  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex >= oldLines.length) {
      result.push({
        type: DIFF_TYPE.ADDED,
        newLine: newLines[newIndex]
      });
      newIndex += 1;
    } else if (newIndex >= newLines.length) {
      result.push({
        type: DIFF_TYPE.DELETED,
        oldLine: oldLines[oldIndex]
      });
      oldIndex += 1;
    } else {
      // Trim trailing whitespace from lines for comparison (but preserve leading whitespace)
      const oldLineTrimmed = oldLines[oldIndex].replace(/\s+$/, "");
      const newLineTrimmed = newLines[newIndex].replace(/\s+$/, "");

      if (oldLineTrimmed === "" && newLineTrimmed !== "") {
        result.push({
          type: DIFF_TYPE.ADDED,
          newLine: newLines[newIndex]
        });
        newIndex += 1;
      } else if (newLineTrimmed === "" && oldLineTrimmed !== "") {
        result.push({
          type: DIFF_TYPE.DELETED,
          oldLine: oldLines[oldIndex]
        });
        oldIndex += 1;
      } else if (oldLineTrimmed === newLineTrimmed) {
        result.push({
          type: DIFF_TYPE.UNCHANGED,
          oldLine: oldLines[oldIndex],
          newLine: newLines[newIndex]
        });
        oldIndex += 1;
        newIndex += 1;
      } else {
        const currentOldIndex = oldIndex;
        const currentNewIndex = newIndex;
        const currentOldLine = oldLines[currentOldIndex];
        const currentNewLine = newLines[currentNewIndex];

        const nextOldMatch = newLines.findIndex(
          (line, idx) =>
            idx >= currentNewIndex &&
            line.replace(/\s+$/, "") === currentOldLine.replace(/\s+$/, "")
        );
        const nextNewMatch = oldLines.findIndex(
          (line, idx) =>
            idx >= currentOldIndex &&
            line.replace(/\s+$/, "") === currentNewLine.replace(/\s+$/, "")
        );

        if (nextOldMatch === -1 && nextNewMatch === -1) {
          result.push({
            type: DIFF_TYPE.MODIFIED,
            oldLine: currentOldLine,
            newLine: currentNewLine
          });
          oldIndex += 1;
          newIndex += 1;
        } else if (nextOldMatch !== -1 && (nextNewMatch === -1 || nextOldMatch < nextNewMatch)) {
          while (newIndex < nextOldMatch) {
            result.push({
              type: DIFF_TYPE.ADDED,
              newLine: newLines[newIndex]
            });
            newIndex += 1;
          }
        } else {
          while (oldIndex < nextNewMatch) {
            result.push({
              type: DIFF_TYPE.DELETED,
              oldLine: oldLines[oldIndex]
            });
            oldIndex += 1;
          }
        }
      }
    }
  }

  return result;
};

// Word-level diff for modified lines
// Normalizes texts before computing word diff to ignore whitespace-only changes
// If there are no common words, returns null to indicate entire line should be highlighted
const computeWordDiff = (oldText: string, newText: string): WordDiff[] | null => {
  // Normalize the texts before computing word diff
  const normalizedOld = normalizeSecretValue(oldText);
  const normalizedNew = normalizeSecretValue(newText);

  const wordRegex = /(\s+|[^\s\w]+|\w+)/g;
  const oldWords = normalizedOld.match(wordRegex) || [];
  const newWords = normalizedNew.match(wordRegex) || [];

  // Check if there are any common words (excluding whitespace and punctuation)
  const oldWordSet = new Set(oldWords.filter((w) => /\w/.test(w)));
  const newWordSet = new Set(newWords.filter((w) => /\w/.test(w)));
  const hasCommonWords = [...oldWordSet].some((word) => newWordSet.has(word));

  // If no common words, return null to indicate entire line should be highlighted
  if (!hasCommonWords && oldWords.length > 0 && newWords.length > 0) {
    return null;
  }

  const result: WordDiff[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldWords.length || newIdx < newWords.length) {
    if (oldIdx >= oldWords.length) {
      result.push({ type: DIFF_TYPE.ADDED, text: newWords[newIdx] });
      newIdx += 1;
    } else if (newIdx >= newWords.length) {
      result.push({ type: DIFF_TYPE.DELETED, text: oldWords[oldIdx] });
      oldIdx += 1;
    } else if (oldWords[oldIdx] === newWords[newIdx]) {
      result.push({ type: DIFF_TYPE.UNCHANGED, text: oldWords[oldIdx] });
      oldIdx += 1;
      newIdx += 1;
    } else {
      const currentOldIdx = oldIdx;
      const currentNewIdx = newIdx;
      const currentOldWord = oldWords[currentOldIdx];
      const currentNewWord = newWords[currentNewIdx];

      const nextOldMatch = newWords.findIndex(
        (word, idx) => idx >= currentNewIdx && word === currentOldWord
      );
      const nextNewMatch = oldWords.findIndex(
        (word, idx) => idx >= currentOldIdx && word === currentNewWord
      );

      if (nextOldMatch === -1 && nextNewMatch === -1) {
        result.push({ type: DIFF_TYPE.DELETED, text: currentOldWord });
        result.push({ type: DIFF_TYPE.ADDED, text: currentNewWord });
        oldIdx += 1;
        newIdx += 1;
      } else if (nextOldMatch !== -1 && (nextNewMatch === -1 || nextOldMatch < nextNewMatch)) {
        while (newIdx < nextOldMatch) {
          result.push({ type: DIFF_TYPE.ADDED, text: newWords[newIdx] });
          newIdx += 1;
        }
      } else {
        while (oldIdx < nextNewMatch) {
          result.push({ type: DIFF_TYPE.DELETED, text: oldWords[oldIdx] });
          oldIdx += 1;
        }
      }
    }
  }
  return result;
};

// Render single-line diff (just word highlighting, no container/+/-)
const renderSingleLineDiffForApproval = (
  oldText: string,
  newText: string,
  isOldVersion: boolean
): JSX.Element => {
  const normalizedOld = normalizeSecretValue(oldText);
  const normalizedNew = normalizeSecretValue(newText);

  // If completely new or deleted, or no common words, show as single block
  const wordDiffs = computeWordDiff(oldText, newText);
  const shouldShowAsBlock =
    (normalizedOld === "" && normalizedNew !== "") ||
    (normalizedOld !== "" && normalizedNew === "") ||
    wordDiffs === null;

  if (shouldShowAsBlock) {
    const value = isOldVersion ? normalizedOld : normalizedNew;
    return <div className="font-mono text-sm break-words">{value}</div>;
  }

  // Show word-by-word diff when there are common words
  return (
    <div className="font-mono text-sm break-words">
      {wordDiffs.map((wordDiff, wordIdx) => {
        if (isOldVersion && wordDiff.type === DIFF_TYPE.ADDED) return null;
        if (!isOldVersion && wordDiff.type === DIFF_TYPE.DELETED) return null;

        const wordKey = `singleline-word-${wordIdx}`;
        const wordClass =
          wordDiff.type === DIFF_TYPE.DELETED
            ? "bg-red-600/70 rounded px-0.5"
            : wordDiff.type === DIFF_TYPE.ADDED
              ? "bg-green-600/70 rounded px-0.5"
              : "";

        return (
          <span key={wordKey} className={wordClass}>
            {wordDiff.text}
          </span>
        );
      })}
    </div>
  );
};

// Render multiline diff for approval screen (side-by-side view)
const renderMultilineDiffForApproval = (
  oldText: string,
  newText: string,
  isOldVersion: boolean,
  renderNewVersionDiffLine?: (params: {
    diffLine: DiffLine;
    lineKey: string;
    isFirstChanged: boolean;
    lineClass: string;
    computeWordDiff: (oldText: string, newText: string) => WordDiff[] | null;
  }) => JSX.Element | null
): JSX.Element => {
  const diffLines = computeLineDiff(oldText, newText);

  // Find the first changed line index
  const firstChangedIndex = diffLines.findIndex((line) =>
    isOldVersion
      ? line.type === DIFF_TYPE.DELETED || line.type === DIFF_TYPE.MODIFIED
      : line.type === DIFF_TYPE.ADDED || line.type === DIFF_TYPE.MODIFIED
  );

  return (
    <div className="min-w-full font-mono text-sm break-words whitespace-pre-wrap">
      {diffLines.map((diffLine, lineIndex) => {
        const lineKey = `multiline-${lineIndex}-${diffLine.type}`;
        const isFirstChanged = lineIndex === firstChangedIndex;

        if (isOldVersion) {
          // Render old version
          if (diffLine.type === DIFF_TYPE.ADDED) {
            return null; // Skip added lines in old version
          }

          const isChanged =
            diffLine.type === DIFF_TYPE.DELETED || diffLine.type === DIFF_TYPE.MODIFIED;
          const lineClass = isChanged
            ? "flex min-w-full bg-red-500/70 rounded-xs text-red-300"
            : "flex min-w-full";

          if (diffLine.type === DIFF_TYPE.MODIFIED && diffLine.oldLine) {
            const wordDiffs = computeWordDiff(diffLine.oldLine, diffLine.newLine || "");
            // If no common words, just show the line with line-level background (no extra inner highlight)
            if (wordDiffs === null) {
              return (
                <div
                  key={lineKey}
                  className={lineClass}
                  data-first-change={isFirstChanged ? "true" : undefined}
                >
                  <div className="w-4 shrink-0">-</div>
                  <div className="min-w-0 flex-1 break-words">{diffLine.oldLine}</div>
                </div>
              );
            }
            return (
              <div
                key={lineKey}
                className={lineClass}
                data-first-change={isFirstChanged ? "true" : undefined}
              >
                <div className="w-4 shrink-0">-</div>
                <div className="min-w-0 flex-1 break-words">
                  {wordDiffs.map((wordDiff, wordIdx) => {
                    if (wordDiff.type === DIFF_TYPE.ADDED) return null;
                    const wordKey = `${lineKey}-word-${wordIdx}`;
                    const wordClass =
                      wordDiff.type === DIFF_TYPE.DELETED ? "bg-red-600/70 rounded px-0.5" : "";
                    return (
                      <span key={wordKey} className={wordClass}>
                        {wordDiff.text}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          }

          return (
            <div
              key={lineKey}
              className={lineClass}
              data-first-change={isFirstChanged ? "true" : undefined}
            >
              <div className="w-4 shrink-0">{isChanged ? "-" : " "}</div>
              <div className="min-w-0 flex-1 break-words">{diffLine.oldLine}</div>
            </div>
          );
        }

        // Render new version
        if (diffLine.type === DIFF_TYPE.DELETED) {
          return null; // Skip deleted lines in new version
        }

        const isChanged = diffLine.type === DIFF_TYPE.ADDED || diffLine.type === DIFF_TYPE.MODIFIED;
        const lineClass = isChanged
          ? "flex min-w-full bg-green-500/70 rounded-xs text-green-300"
          : "flex min-w-full";

        // Use the hook to render new version diff lines
        if (renderNewVersionDiffLine) {
          const rendered = renderNewVersionDiffLine({
            diffLine,
            lineKey,
            isFirstChanged,
            lineClass,
            computeWordDiff
          });
          if (rendered !== null) {
            return rendered;
          }
        }

        return (
          <div
            key={lineKey}
            className={lineClass}
            data-first-change={isFirstChanged ? "true" : undefined}
          >
            <div className="w-4 shrink-0">{isChanged ? "+" : " "}</div>
            <div className="min-w-0 flex-1 break-words">{diffLine.newLine}</div>
          </div>
        );
      })}
    </div>
  );
};
// ===== END MULTILINE DIFF FUNCTIONS =====

export type Props = {
  op: CommitType;
  secretVersion?: SecretV3Raw;
  newVersion?: Omit<TSecretApprovalSecChange, "tags"> & {
    tags?: WsTag[];
    secretMetadata?: { key: string; value: string }[];
    skipMultilineEncoding?: boolean;
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

// Helper function to render old secret value
const renderOldSecretValue = ({
  isRotatedSecret,
  isValueHidden,
  value,
  isVisible,
  onToggleVisibility,
  hasValueChanges,
  isBothSingleLine,
  oldValue,
  newValue,
  oldDiffContainerRef,
  renderNewVersionDiffLine
}: {
  isRotatedSecret?: boolean;
  isValueHidden?: boolean;
  value?: string;
  isVisible: boolean;
  onToggleVisibility: () => void;
  hasValueChanges: boolean;
  isBothSingleLine: boolean;
  oldValue: string;
  newValue: string;
  oldDiffContainerRef: React.RefObject<HTMLDivElement>;
  renderNewVersionDiffLine: (params: {
    diffLine: DiffLine;
    lineKey: string;
    isFirstChanged: boolean;
    lineClass: string;
    computeWordDiff: (oldText: string, newText: string) => WordDiff[] | null;
  }) => JSX.Element | null;
}) => {
  if (isRotatedSecret) {
    return (
      <span className="text-mineshaft-400">Rotated Secret value will not be affected</span>
    );
  }

  if (isValueHidden) {
    return (
      <div className="relative">
        <div className="absolute top-1/2 left-1 z-50 -translate-y-1/2">
          <Tooltip position="right" content="You do not have access to view the old secret value.">
            <FontAwesomeIcon className="pl-2 text-mineshaft-300" size="sm" icon={faEyeSlash} />
          </Tooltip>
        </div>
        <SecretInput
          isReadOnly
          isVisible={isVisible}
          valueAlwaysHidden={isValueHidden}
          value={value}
          containerClassName="border border-mineshaft-600 bg-bunker-700 py-1.5 text-bunker-300 hover:border-primary-400/50 pr-2 pl-8"
        />
      </div>
    );
  }

  if (hasValueChanges) {
    if (isBothSingleLine) {
      return (
        <div className="relative rounded-lg border border-mineshaft-600 p-2" style={{ backgroundColor: "#120808" }}>
          {renderSingleLineDiffForApproval(oldValue, newValue, true)}
        </div>
      );
    }

    return (
      <div
        ref={oldDiffContainerRef}
        className="relative max-h-96 overflow-x-auto overflow-y-auto rounded-lg border border-mineshaft-600 p-2 thin-scrollbar"
        style={{ backgroundColor: "#120808" }}
      >
        <div className="min-w-max">
          {renderMultilineDiffForApproval(oldValue, newValue, true, renderNewVersionDiffLine)}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <SecretInput
        isReadOnly
        isVisible={isVisible}
        valueAlwaysHidden={isValueHidden}
        value={value}
        containerClassName={twMerge(
          "border border-mineshaft-600 bg-bunker-700 py-1.5 text-bunker-300 hover:border-primary-400/50",
          isValueHidden ? "pr-2 pl-8" : "px-2"
        )}
      />
      {!isValueHidden && (
        <div className="absolute top-1 right-1" onClick={onToggleVisibility}>
          <FontAwesomeIcon
            icon={isVisible ? faEyeSlash : faEye}
            className="cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-800 p-1.5 text-mineshaft-300 hover:bg-mineshaft-700"
          />
        </div>
      )}
    </div>
  );
};

// Helper function to render new secret value
const renderNewSecretValue = ({
  isRotatedSecret,
  isValueHidden,
  value,
  fallbackValue,
  isVisible,
  onToggleVisibility,
  hasValueChanges,
  isBothSingleLine,
  oldValue,
  newValue,
  newDiffContainerRef,
  renderNewVersionDiffLine
}: {
  isRotatedSecret?: boolean;
  isValueHidden?: boolean;
  value?: string;
  fallbackValue?: string;
  isVisible: boolean;
  onToggleVisibility: () => void;
  hasValueChanges: boolean;
  isBothSingleLine: boolean;
  oldValue: string;
  newValue: string;
  newDiffContainerRef: React.RefObject<HTMLDivElement>;
  renderNewVersionDiffLine: (params: {
    diffLine: DiffLine;
    lineKey: string;
    isFirstChanged: boolean;
    lineClass: string;
    computeWordDiff: (oldText: string, newText: string) => WordDiff[] | null;
  }) => JSX.Element | null;
}) => {
  if (isRotatedSecret) {
    return (
      <span className="text-mineshaft-400">Rotated Secret value will not be affected</span>
    );
  }

  if (isValueHidden) {
    return (
      <div className="relative">
        <div className="absolute top-1/2 left-1 z-50 -translate-y-1/2">
          <Tooltip position="right" content="You do not have access to view the new secret value.">
            <FontAwesomeIcon className="pl-2 text-mineshaft-300" size="sm" icon={faEyeSlash} />
          </Tooltip>
        </div>
        <SecretInput
          isReadOnly
          valueAlwaysHidden={isValueHidden}
          isVisible={isVisible}
          value={value ?? fallbackValue}
          containerClassName="border border-mineshaft-600 bg-bunker-700 py-1.5 text-bunker-300 hover:border-primary-400/50 pr-2 pl-8"
        />
      </div>
    );
  }

  if (hasValueChanges) {
    if (isBothSingleLine) {
      return (
        <div className="relative rounded-lg border border-mineshaft-600 p-2" style={{ backgroundColor: "#081208" }}>
          {renderSingleLineDiffForApproval(oldValue, newValue, false)}
        </div>
      );
    }

    return (
      <div
        ref={newDiffContainerRef}
        className="relative max-h-96 overflow-x-auto overflow-y-auto rounded-lg border border-mineshaft-600 p-2 thin-scrollbar"
        style={{ backgroundColor: "#081208" }}
      >
        <div className="min-w-max">
          {renderMultilineDiffForApproval(oldValue, newValue, false, renderNewVersionDiffLine)}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <SecretInput
        isReadOnly
        valueAlwaysHidden={isValueHidden}
        isVisible={isVisible}
        value={value ?? fallbackValue}
        containerClassName={twMerge(
          "border border-mineshaft-600 bg-bunker-700 py-1.5 text-bunker-300 hover:border-primary-400/50",
          isValueHidden ? "pr-2 pl-8" : "px-2"
        )}
      />
      {!isValueHidden && (
        <div className="absolute top-1 right-1" onClick={onToggleVisibility}>
          <FontAwesomeIcon
            icon={isVisible ? faEyeSlash : faEye}
            className="cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-800 p-1.5 text-mineshaft-300 hover:bg-mineshaft-700"
          />
        </div>
      )}
    </div>
  );
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
  const [isOldSecretValueVisible, setIsOldSecretValueVisible] = useState(false);
  const [isNewSecretValueVisible, setIsNewSecretValueVisible] = useState(false);
  const oldDiffContainerRef = useRef<HTMLDivElement>(null);
  const newDiffContainerRef = useRef<HTMLDivElement>(null);
  const renderNewVersionDiffLine = useRenderNewVersionDiffLine();

  // Compute conditions for secret value comparisons
  const oldSecretValue = secretVersion?.secretValue ?? "";
  const newSecretValue = newVersion?.secretValue ?? "";
  const newSecretValueForComparison = newVersion?.secretValue ?? secretVersion?.secretValue ?? "";
  const hasValueChanges = !areValuesEqual(oldSecretValue, newSecretValue);
  const hasValueChangesForNew = !areValuesEqual(oldSecretValue, newSecretValueForComparison);
  const isBothSingleLine = isSingleLine(oldSecretValue) && isSingleLine(newSecretValue);
  const isBothSingleLineForNew = isSingleLine(oldSecretValue) && isSingleLine(newSecretValueForComparison);

  // Scroll to first change when diff is rendered
  useEffect(() => {
    const scrollToFirstChange = (container: HTMLDivElement | null) => {
      if (!container) return;

      const firstChange = container.querySelector('[data-first-change="true"]') as HTMLElement;
      if (firstChange) {
        // Calculate the element's position relative to the container's scrollable area
        const elementTop = firstChange.offsetTop;
        const containerScrollTop = container.scrollTop;
        const containerHeight = container.clientHeight;
        const elementHeight = firstChange.offsetHeight;

        // Check if element is visible in the container viewport
        const isVisible =
          elementTop >= containerScrollTop &&
          elementTop + elementHeight <= containerScrollTop + containerHeight;

        // If element is not visible, scroll the container (not the page)
        if (!isVisible) {
          // Scroll to center the element in the container
          const targetScrollTop = elementTop - containerHeight / 2 + elementHeight / 2;
          container.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: "smooth"
          });
        }
      }
    };

    // Small delay to ensure DOM is rendered
    const timeout = setTimeout(() => {
      scrollToFirstChange(oldDiffContainerRef.current);
      scrollToFirstChange(newDiffContainerRef.current);
    }, 100);

    return () => clearTimeout(timeout);
  }, [secretVersion?.secretValue, newVersion?.secretValue]);

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
        <div className="flex flex-col space-y-4 space-x-0 xl:flex-row xl:space-y-0 xl:space-x-4">
          {op === CommitType.UPDATE || op === CommitType.DELETE ? (
            <div className="flex w-full cursor-default flex-col rounded-md border border-red-600/60 bg-red-600/10 p-4 xl:w-1/2">
              <div className="mb-4 flex flex-row justify-between">
                <span className="text-md font-medium">Previous Secret</span>
                <div className="rounded-full bg-red px-2 pt-[0.2rem] pb-[0.14rem] text-xs font-medium">
                  <FontAwesomeIcon icon={faCircleXmark} className="pr-1 text-white" />
                  Previous
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Key</div>
                <p className="max-w-lg text-sm break-words">{secretVersion?.secretKey}</p>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Value</div>
                <div className="text-sm">
                  {renderOldSecretValue({
                    isRotatedSecret: newVersion?.isRotatedSecret,
                    isValueHidden: secretVersion?.secretValueHidden,
                    value: secretVersion?.secretValue,
                    isVisible: isOldSecretValueVisible,
                    onToggleVisibility: () => setIsOldSecretValueVisible(!isOldSecretValueVisible),
                    hasValueChanges,
                    isBothSingleLine,
                    oldValue: oldSecretValue,
                    newValue: newSecretValue,
                    oldDiffContainerRef,
                    renderNewVersionDiffLine
                  })}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Comment</div>
                <div className="max-h-20 thin-scrollbar max-w-136 overflow-y-auto text-sm break-words xl:max-w-md">
                  {secretVersion?.secretComment || (
                    <span className="text-sm text-mineshaft-300">-</span>
                  )}{" "}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Tags</div>
                <div className="flex flex-wrap gap-y-2">
                  {(secretVersion?.tags?.length ?? 0) ? (
                    secretVersion?.tags?.map(({ slug, id: tagId, color }) => (
                      <Tag
                        className="flex w-min items-center space-x-1.5 border border-mineshaft-500 bg-mineshaft-800"
                        key={`${secretVersion.id}-${tagId}`}
                      >
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: color || "#bec2c8" }}
                        />
                        <div className="text-sm">{slug}</div>
                      </Tag>
                    ))
                  ) : (
                    <span className="text-sm text-mineshaft-300">-</span>
                  )}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Metadata</div>
                <div>
                  {secretVersion?.secretMetadata?.length ? (
                    <div className="mt-1 flex flex-wrap gap-2 text-sm text-mineshaft-300">
                      {secretVersion.secretMetadata?.map((el) => (
                        <div key={el.key} className="flex items-center">
                          <Tag
                            size="xs"
                            className="mr-0 flex items-center rounded-r-none border border-mineshaft-500"
                          >
                            <FontAwesomeIcon icon={faKey} size="xs" className="mr-1" />
                            <Tooltip
                              className="max-w-lg break-words whitespace-normal"
                              content={el.key}
                            >
                              <div className="max-w-[125px] overflow-hidden text-ellipsis whitespace-nowrap">
                                {el.key}
                              </div>
                            </Tooltip>
                          </Tag>
                          <Tag
                            size="xs"
                            className="flex items-center rounded-l-none border border-mineshaft-500 bg-mineshaft-900 pl-1"
                          >
                            <Tooltip
                              className="max-w-lg break-words whitespace-normal"
                              content={el.value}
                            >
                              <div className="max-w-[125px] overflow-hidden text-ellipsis whitespace-nowrap">
                                {el.value}
                              </div>
                            </Tooltip>
                          </Tag>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-mineshaft-300">-</p>
                  )}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Multi-line Encoding</div>
                <div className="text-sm">
                  {secretVersion?.skipMultilineEncoding?.toString() || "false"}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-md flex w-full items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-800 text-mineshaft-300 xl:w-1/2">
              Secret did not exist in the previous version.
            </div>
          )}
          {op === CommitType.UPDATE || op === CommitType.CREATE ? (
            <div className="flex w-full cursor-default flex-col rounded-md border border-green-600/60 bg-green-600/10 p-4 xl:w-1/2">
              <div className="mb-4 flex flex-row justify-between">
                <span className="text-md font-medium">New Secret</span>
                <div className="rounded-full bg-green-600 px-2 pt-[0.2rem] pb-[0.14rem] text-xs font-medium">
                  <FontAwesomeIcon icon={faCircleCheck} className="pr-1 text-white" />
                  New
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Key</div>
                <div className="max-w-md text-sm break-words">{newVersion?.secretKey} </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Value</div>
                <div className="text-sm">
                  {renderNewSecretValue({
                    isRotatedSecret: newVersion?.isRotatedSecret,
                    isValueHidden: newVersion?.secretValueHidden,
                    value: newVersion?.secretValue,
                    fallbackValue: secretVersion?.secretValue,
                    isVisible: isNewSecretValueVisible,
                    onToggleVisibility: () => setIsNewSecretValueVisible(!isNewSecretValueVisible),
                    hasValueChanges: hasValueChangesForNew,
                    isBothSingleLine: isBothSingleLineForNew,
                    oldValue: oldSecretValue,
                    newValue: newSecretValueForComparison,
                    newDiffContainerRef,
                    renderNewVersionDiffLine
                  })}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Comment</div>
                <div className="max-h-20 thin-scrollbar max-w-136 overflow-y-auto text-sm break-words xl:max-w-md">
                  {(newVersion?.secretComment ?? secretVersion?.secretComment) || (
                    <span className="text-sm text-mineshaft-300">-</span>
                  )}{" "}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Tags</div>
                <div className="flex flex-wrap gap-y-2">
                  {(newVersion?.tags?.length ?? 0) ? (
                    newVersion?.tags?.map(({ slug, id: tagId, color }) => (
                      <Tag
                        className="flex w-min items-center space-x-1.5 border border-mineshaft-500 bg-mineshaft-800"
                        key={`${newVersion.id}-${tagId}`}
                      >
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: color || "#bec2c8" }}
                        />
                        <div className="text-sm">{slug}</div>
                      </Tag>
                    ))
                  ) : (
                    <span className="text-sm text-mineshaft-300">-</span>
                  )}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Metadata</div>
                {(newVersion?.secretMetadata ?? secretVersion?.secretMetadata)?.length ? (
                  <div className="mt-1 flex flex-wrap gap-2 text-sm text-mineshaft-300">
                    {(newVersion?.secretMetadata ?? secretVersion?.secretMetadata)?.map((el) => (
                      <div key={el.key} className="flex items-center">
                        <Tag
                          size="xs"
                          className="mr-0 flex items-center rounded-r-none border border-mineshaft-500"
                        >
                          <FontAwesomeIcon icon={faKey} size="xs" className="mr-1" />
                          <Tooltip
                            className="max-w-lg break-words whitespace-normal"
                            content={el.key}
                          >
                            <div className="max-w-[125px] overflow-hidden text-ellipsis whitespace-nowrap">
                              {el.key}
                            </div>
                          </Tooltip>
                        </Tag>
                        <Tag
                          size="xs"
                          className="flex items-center rounded-l-none border border-mineshaft-500 bg-mineshaft-900 pl-1"
                        >
                          <Tooltip
                            className="max-w-lg break-words whitespace-normal"
                            content={el.value}
                          >
                            <div className="max-w-[125px] overflow-hidden text-ellipsis whitespace-nowrap">
                              {el.value}
                            </div>
                          </Tooltip>
                        </Tag>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-mineshaft-300">-</p>
                )}
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Multi-line Encoding</div>
                <div className="text-sm">
                  {newVersion?.skipMultilineEncoding?.toString() ??
                    secretVersion?.skipMultilineEncoding?.toString() ??
                    "false"}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-md flex w-full items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-800 text-mineshaft-300 xl:w-1/2">
              {" "}
              Secret did not exist in the previous version.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
