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
import type { Change } from "diff";
import { diffLines, diffWords } from "diff";
import { twMerge } from "tailwind-merge";

import { SecretInput, Tag, Tooltip } from "@app/components/v2";
import { CommitType, SecretV3Raw, TSecretApprovalSecChange, WsTag } from "@app/hooks/api/types";

// ===== MULTILINE DIFF FUNCTIONS =====

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

// Use jsdiff for line-by-line diffing - returns Change[] directly
const computeLineDiff = (oldText: string, newText: string): Change[] => {
  // Normalize the texts before diffing
  const normalizedOld = normalizeSecretValue(oldText);
  const normalizedNew = normalizeSecretValue(newText);

  // Use jsdiff's diffLines
  return diffLines(normalizedOld, normalizedNew, {
    ignoreWhitespace: false,
    newlineIsToken: false
  });
};

// Use jsdiff for word-level diffing - returns Change[] directly or null
const computeWordDiff = (oldText: string, newText: string): Change[] | null => {
  // Normalize the texts before diffing
  const normalizedOld = normalizeSecretValue(oldText);
  const normalizedNew = normalizeSecretValue(newText);

  // Use jsdiff's diffWords
  const changes = diffWords(normalizedOld, normalizedNew);

  // Check if there are any common words (excluding whitespace and punctuation)
  const hasCommonWords = changes.some(
    (change) => !change.added && !change.removed && /\w/.test(change.value)
  );

  // If no common words, return null to indicate entire line should be highlighted
  if (!hasCommonWords && normalizedOld.trim() !== "" && normalizedNew.trim() !== "") {
    return null;
  }

  return changes;
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
      {wordDiffs.map((change, wordIdx) => {
        if (isOldVersion && change.added) return null;
        if (!isOldVersion && change.removed) return null;

        const wordKey = `singleline-word-${wordIdx}`;
        const wordClass = change.removed
          ? "bg-red-600/70 rounded px-0.5"
          : change.added
            ? "bg-green-600/70 rounded px-0.5"
            : "";

        return (
          <span key={wordKey} className={wordClass}>
            {change.value}
          </span>
        );
      })}
    </div>
  );
};

// Helper to split change value into lines, removing trailing empty string from split
const splitChangeIntoLines = (value: string): string[] => {
  const lines = value.split("\n");
  // Remove trailing empty string (artifact of split when value ends with newline)
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
};

// Render multiline diff for approval screen (side-by-side view)
const renderMultilineDiffForApproval = (
  oldText: string,
  newText: string,
  isOldVersion: boolean
): JSX.Element => {
  const lineChanges = computeLineDiff(oldText, newText);

  // Find the first changed line index
  let firstChangedIndex = -1;
  let lineIndex = 0;
  for (let i = 0; i < lineChanges.length; i += 1) {
    const change = lineChanges[i];
    const lines = splitChangeIntoLines(change.value);

    const isChanged = isOldVersion ? change.removed : change.added;
    if (isChanged && firstChangedIndex === -1) {
      firstChangedIndex = lineIndex;
      break;
    }
    lineIndex += lines.length;
  }

  let currentLineIndex = 0;
  let firstChangedFound = false;

  return (
    <div className="min-w-full font-mono text-sm break-words whitespace-pre-wrap">
      {lineChanges.map((change, changeIdx) => {
        const nextChange = lineChanges[changeIdx + 1];
        const lines = splitChangeIntoLines(change.value);

        return lines.map((line, lineIdx) => {
          const lineKey = `multiline-${changeIdx}-${lineIdx}`;
          const isFirstChanged = !firstChangedFound && currentLineIndex === firstChangedIndex;
          if (isFirstChanged) firstChangedFound = true;
          currentLineIndex += 1;

          if (isOldVersion) {
            // Render old version
            if (change.added) {
              return null; // Skip added lines in old version
            }

            const isChanged = change.removed;
            const lineClass = isChanged
              ? "flex min-w-full bg-red-500/70 rounded-xs text-red-300"
              : "flex min-w-full";

            // If this is a removed line followed by an added line, it's a modification
            if (change.removed && nextChange?.added) {
              const nextLines = splitChangeIntoLines(nextChange.value);
              const newLine = nextLines[lineIdx] ?? "";
              const wordDiffs = computeWordDiff(line, newLine);

              // If no common words, just show the line with line-level background
              if (wordDiffs === null) {
                return (
                  <div
                    key={lineKey}
                    className={lineClass}
                    data-first-change={isFirstChanged ? "true" : undefined}
                  >
                    <div className="w-4 shrink-0">-</div>
                    <div className="min-w-0 flex-1 break-words">{line}</div>
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
                    {wordDiffs.map((wordChange, wordIdx) => {
                      if (wordChange.added) return null;
                      const wordKey = `${lineKey}-word-${wordIdx}`;
                      const wordClass = wordChange.removed ? "bg-red-600/70 rounded px-0.5" : "";
                      return (
                        <span key={wordKey} className={wordClass}>
                          {wordChange.value}
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
                <div className="min-w-0 flex-1 break-words">{line}</div>
              </div>
            );
          }

          // Render new version
          if (change.removed) {
            return null; // Skip deleted lines in new version
          }

          // Check if previous change was removed (modification case)
          const prevChange = changeIdx > 0 ? lineChanges[changeIdx - 1] : undefined;
          const isModification = prevChange?.removed && change.added;

          const isChanged = change.added;
          const lineClass = isChanged
            ? "flex min-w-full bg-green-500/70 rounded-xs text-green-300"
            : "flex min-w-full";

          // If this is a modification, show word-level diff
          if (isModification && prevChange) {
            const prevLines = splitChangeIntoLines(prevChange.value);
            const oldLine = prevLines[lineIdx] ?? "";
            const wordDiffs = computeWordDiff(oldLine, line);

            // If no common words, just show the line with line-level background
            if (wordDiffs === null) {
              return (
                <div
                  key={lineKey}
                  className={lineClass}
                  data-first-change={isFirstChanged ? "true" : undefined}
                >
                  <div className="w-4 shrink-0">+</div>
                  <div className="min-w-0 flex-1 break-words">{line}</div>
                </div>
              );
            }

            return (
              <div
                key={lineKey}
                className={lineClass}
                data-first-change={isFirstChanged ? "true" : undefined}
              >
                <div className="w-4 shrink-0">+</div>
                <div className="min-w-0 flex-1 break-words">
                  {wordDiffs.map((wordChange, wordIdx) => {
                    if (wordChange.removed) return null;
                    const wordKey = `${lineKey}-word-${wordIdx}`;
                    const wordClass = wordChange.added ? "bg-green-600/70 rounded px-0.5" : "";
                    return (
                      <span key={wordKey} className={wordClass}>
                        {wordChange.value}
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
              <div className="w-4 shrink-0">{isChanged ? "+" : " "}</div>
              <div className="min-w-0 flex-1 break-words">{line}</div>
            </div>
          );
        });
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
  oldDiffContainerRef
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
}) => {
  if (isRotatedSecret) {
    return <span className="text-mineshaft-400">Rotated Secret value will not be affected</span>;
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
        <div
          className="relative rounded-lg border border-mineshaft-600 p-2"
          style={{ backgroundColor: "#120808" }}
        >
          {renderSingleLineDiffForApproval(oldValue, newValue, true)}
        </div>
      );
    }

    return (
      <div
        ref={oldDiffContainerRef}
        className="relative max-h-96 thin-scrollbar overflow-x-auto overflow-y-auto rounded-lg border border-mineshaft-600 p-2"
        style={{ backgroundColor: "#120808" }}
      >
        <div className="min-w-max">
          {renderMultilineDiffForApproval(oldValue, newValue, true)}
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
  newDiffContainerRef
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
}) => {
  if (isRotatedSecret) {
    return <span className="text-mineshaft-400">Rotated Secret value will not be affected</span>;
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
        <div
          className="relative rounded-lg border border-mineshaft-600 p-2"
          style={{ backgroundColor: "#081208" }}
        >
          {renderSingleLineDiffForApproval(oldValue, newValue, false)}
        </div>
      );
    }

    return (
      <div
        ref={newDiffContainerRef}
        className="relative max-h-96 thin-scrollbar overflow-x-auto overflow-y-auto rounded-lg border border-mineshaft-600 p-2"
        style={{ backgroundColor: "#081208" }}
      >
        <div className="min-w-max">
          {renderMultilineDiffForApproval(oldValue, newValue, false)}
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

  // Compute conditions for secret value comparisons
  const oldSecretValue = secretVersion?.secretValue ?? "";
  const newSecretValue = newVersion?.secretValue ?? "";
  const newSecretValueForComparison = newVersion?.secretValue ?? secretVersion?.secretValue ?? "";
  const hasValueChanges = !areValuesEqual(oldSecretValue, newSecretValue);
  const hasValueChangesForNew = !areValuesEqual(oldSecretValue, newSecretValueForComparison);
  const isBothSingleLine = isSingleLine(oldSecretValue) && isSingleLine(newSecretValue);
  const isBothSingleLineForNew =
    isSingleLine(oldSecretValue) && isSingleLine(newSecretValueForComparison);

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
            <div className="flex w-full cursor-default flex-col rounded-lg border border-red-600/60 bg-red-600/10 p-4 xl:w-1/2">
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
                    oldDiffContainerRef
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
            <div className="flex w-full cursor-default flex-col rounded-lg border border-green-600/60 bg-green-600/10 p-4 xl:w-1/2">
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
                    newDiffContainerRef
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
