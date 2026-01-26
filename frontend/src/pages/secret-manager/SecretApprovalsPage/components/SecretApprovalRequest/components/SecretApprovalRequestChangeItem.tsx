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

// ===== MULTILINE DIFF FUNCTIONS =====
const DIFF_TYPE = {
  ADDED: "added",
  DELETED: "deleted",
  UNCHANGED: "unchanged",
  MODIFIED: "modified"
} as const;

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
const computeLineDiff = (oldText: string, newText: string): DiffLine[] => {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
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
    } else if (oldLines[oldIndex] === newLines[newIndex]) {
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
        (line, idx) => idx >= currentNewIndex && line === currentOldLine
      );
      const nextNewMatch = oldLines.findIndex(
        (line, idx) => idx >= currentOldIndex && line === currentNewLine
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

  return result;
};

// Word-level diff for modified lines
const computeWordDiff = (oldText: string, newText: string): WordDiff[] => {
  const wordRegex = /(\s+|[^\s\w]+|\w+)/g;
  const oldWords = oldText.match(wordRegex) || [];
  const newWords = newText.match(wordRegex) || [];

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
  const wordDiffs = computeWordDiff(oldText, newText);

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
  isOldVersion: boolean
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
            ? "flex min-w-full bg-red-500/50 rounded-xs text-red-300"
            : "flex min-w-full";

          if (diffLine.type === DIFF_TYPE.MODIFIED && diffLine.oldLine) {
            const wordDiffs = computeWordDiff(diffLine.oldLine, diffLine.newLine || "");
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
          ? "flex min-w-full bg-green-500/50 rounded-xs text-green-300"
          : "flex min-w-full";

        if (diffLine.type === DIFF_TYPE.MODIFIED && diffLine.newLine) {
          const wordDiffs = computeWordDiff(diffLine.oldLine || "", diffLine.newLine);
          return (
            <div
              key={lineKey}
              className={lineClass}
              data-first-change={isFirstChanged ? "true" : undefined}
            >
              <div className="w-4 shrink-0">+</div>
              <div className="min-w-0 flex-1 break-words">
                {wordDiffs.map((wordDiff, wordIdx) => {
                  if (wordDiff.type === DIFF_TYPE.DELETED) return null;
                  const wordKey = `${lineKey}-word-${wordIdx}`;
                  const wordClass =
                    wordDiff.type === DIFF_TYPE.ADDED ? "bg-green-600/70 rounded px-0.5" : "";
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
                  {newVersion?.isRotatedSecret ? (
                    <span className="text-mineshaft-400">
                      Rotated Secret value will not be affected
                    </span>
                  ) : secretVersion?.secretValueHidden ? (
                    <div className="relative">
                      <div className="absolute top-1/2 left-1 z-50 -translate-y-1/2">
                        <Tooltip
                          position="right"
                          content="You do not have access to view the old secret value."
                        >
                          <FontAwesomeIcon
                            className="pl-2 text-mineshaft-300"
                            size="sm"
                            icon={faEyeSlash}
                          />
                        </Tooltip>
                      </div>
                      <SecretInput
                        isReadOnly
                        isVisible={isOldSecretValueVisible}
                        valueAlwaysHidden={secretVersion?.secretValueHidden}
                        value={secretVersion?.secretValue}
                        containerClassName="border border-mineshaft-600 bg-bunker-700 py-1.5 text-bunker-300 hover:border-primary-400/50 pr-2 pl-8"
                      />
                    </div>
                  ) : (() => {
                      const oldValue = secretVersion?.secretValue ?? "";
                      const newValue = newVersion?.secretValue ?? "";
                      return oldValue !== newValue;
                    })() ? (
                    (() => {
                      const oldValue = secretVersion?.secretValue ?? "";
                      const newValue = newVersion?.secretValue ?? "";
                      return isSingleLine(oldValue) && isSingleLine(newValue);
                    })() ? (
                      <div
                        className="relative rounded border border-mineshaft-600 p-2"
                        style={{ backgroundColor: "#120808" }}
                      >
                        {renderSingleLineDiffForApproval(
                          secretVersion?.secretValue ?? "",
                          newVersion?.secretValue ?? "",
                          true
                        )}
                      </div>
                    ) : (
                      <div
                        ref={oldDiffContainerRef}
                        className="relative max-h-96 overflow-x-auto overflow-y-auto rounded border border-mineshaft-600 p-2"
                        style={{ backgroundColor: "#120808" }}
                      >
                        <div className="min-w-max">
                          {renderMultilineDiffForApproval(
                            secretVersion?.secretValue ?? "",
                            newVersion?.secretValue ?? "",
                            true
                          )}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="relative">
                      <SecretInput
                        isReadOnly
                        isVisible={isOldSecretValueVisible}
                        valueAlwaysHidden={secretVersion?.secretValueHidden}
                        value={secretVersion?.secretValue}
                        containerClassName={twMerge(
                          "border border-mineshaft-600 bg-bunker-700 py-1.5 text-bunker-300 hover:border-primary-400/50",
                          secretVersion?.secretValueHidden ? "pr-2 pl-8" : "px-2"
                        )}
                      />
                      {!secretVersion?.secretValueHidden && (
                        <div
                          className="absolute top-1 right-1"
                          onClick={() => setIsOldSecretValueVisible(!isOldSecretValueVisible)}
                        >
                          <FontAwesomeIcon
                            icon={isOldSecretValueVisible ? faEyeSlash : faEye}
                            className="cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-800 p-1.5 text-mineshaft-300 hover:bg-mineshaft-700"
                          />
                        </div>
                      )}
                    </div>
                  )}
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
                  {newVersion?.isRotatedSecret ? (
                    <span className="text-mineshaft-400">
                      Rotated Secret value will not be affected
                    </span>
                  ) : newVersion?.secretValueHidden ? (
                    <div className="relative">
                      <div className="absolute top-1/2 left-1 z-50 -translate-y-1/2">
                        <Tooltip
                          position="right"
                          content="You do not have access to view the new secret value."
                        >
                          <FontAwesomeIcon
                            className="pl-2 text-mineshaft-300"
                            size="sm"
                            icon={faEyeSlash}
                          />
                        </Tooltip>
                      </div>
                      <SecretInput
                        isReadOnly
                        valueAlwaysHidden={newVersion?.secretValueHidden}
                        isVisible={isNewSecretValueVisible}
                        value={newVersion?.secretValue ?? secretVersion?.secretValue}
                        containerClassName="border border-mineshaft-600 bg-bunker-700 py-1.5 text-bunker-300 hover:border-primary-400/50 pr-2 pl-8"
                      />
                    </div>
                  ) : (() => {
                      const oldValue = secretVersion?.secretValue ?? "";
                      const newValue = newVersion?.secretValue ?? secretVersion?.secretValue ?? "";
                      return oldValue !== newValue;
                    })() ? (
                    (() => {
                      const oldValue = secretVersion?.secretValue ?? "";
                      const newValue = newVersion?.secretValue ?? secretVersion?.secretValue ?? "";
                      return isSingleLine(oldValue) && isSingleLine(newValue);
                    })() ? (
                      <div
                        className="relative rounded border border-mineshaft-600 p-2"
                        style={{ backgroundColor: "#081208" }}
                      >
                        {renderSingleLineDiffForApproval(
                          secretVersion?.secretValue ?? "",
                          newVersion?.secretValue ?? secretVersion?.secretValue ?? "",
                          false
                        )}
                      </div>
                    ) : (
                      <div
                        ref={newDiffContainerRef}
                        className="relative max-h-96 overflow-x-auto overflow-y-auto rounded border border-mineshaft-600 p-2"
                        style={{ backgroundColor: "#081208" }}
                      >
                        <div className="min-w-max">
                          {renderMultilineDiffForApproval(
                            secretVersion?.secretValue ?? "",
                            newVersion?.secretValue ?? secretVersion?.secretValue ?? "",
                            false
                          )}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="relative">
                      <SecretInput
                        isReadOnly
                        valueAlwaysHidden={newVersion?.secretValueHidden}
                        isVisible={isNewSecretValueVisible}
                        value={newVersion?.secretValue ?? secretVersion?.secretValue}
                        containerClassName={twMerge(
                          "border border-mineshaft-600 bg-bunker-700 py-1.5 text-bunker-300 hover:border-primary-400/50",
                          newVersion?.secretValueHidden ? "pr-2 pl-8" : "px-2"
                        )}
                      />
                      {!newVersion?.secretValueHidden && (
                        <div
                          className="absolute top-1 right-1"
                          onClick={() => setIsNewSecretValueVisible(!isNewSecretValueVisible)}
                        >
                          <FontAwesomeIcon
                            icon={isNewSecretValueVisible ? faEyeSlash : faEye}
                            className="cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-800 p-1.5 text-mineshaft-300 hover:bg-mineshaft-700"
                          />
                        </div>
                      )}
                    </div>
                  )}
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
