/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useRef, useState } from "react";
import { faCircleCheck, faCircleXmark, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { isSingleLine, scrollToFirstChange } from "@app/components/utilities/diff";
import { Tooltip } from "@app/components/v2";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

import { DiffContainer } from "./DiffContainer";
import {
  InlineTextDiff,
  MetadataDiffRenderer,
  MultiLineTextDiffRenderer,
  SingleLineTextDiffRenderer,
  TagsDiffRenderer
} from "./FieldDiffRenderers";
import { MultiLineDiff } from "./MultiLineDiff";
import { SingleLineDiff } from "./SingleLineDiff";

export interface SecretVersionData {
  secretKey?: string;
  secretValue?: string;
  secretValueHidden?: boolean;
  secretComment?: string;
  tags?: Array<{ slug: string; color: string }>;
  secretMetadata?: Array<{ key: string; value: string; isEncrypted?: boolean }>;
  skipMultilineEncoding?: boolean;
}

export interface SecretDiffViewProps {
  operationType: "create" | "update" | "delete";
  oldVersion?: SecretVersionData;
  newVersion?: SecretVersionData;
  oldVersionLabel?: string;
  newVersionLabel?: string;
}

const SecretValueRenderer = ({
  isOldVersion,
  isValueHidden,
  value,
  hasValueChanges,
  isBothSingleLine,
  oldValue,
  newValue,
  containerRef
}: {
  isOldVersion: boolean;
  isValueHidden?: boolean;
  value?: string;
  hasValueChanges: boolean;
  isBothSingleLine: boolean;
  oldValue: string;
  newValue: string;
  containerRef: React.RefObject<HTMLDivElement>;
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const variant = isOldVersion ? "removed" : "added";

  // Visibility toggle icon - shown when user can reveal value, or access denied indicator
  const renderVisibilityIcon = () => {
    if (isValueHidden) {
      return (
        <div className="absolute top-1/2 left-2 z-10 -translate-y-1/2">
          <Tooltip
            position="right"
            content={`You do not have access to view the ${isOldVersion ? "old" : "new"} secret value.`}
          >
            <FontAwesomeIcon className="text-mineshaft-300" size="sm" icon={faEyeSlash} />
          </Tooltip>
        </div>
      );
    }
    const handleToggleVisibility = (e: React.MouseEvent) => {
      e.stopPropagation();
      const newVisibility = !isVisible;
      setIsVisible(newVisibility);

      // Scroll to first change when revealing multi-line content
      if (newVisibility && !isBothSingleLine && containerRef?.current) {
        // Allow DOM to update before scrolling
        requestAnimationFrame(() => {
          if (containerRef.current) {
            scrollToFirstChange(containerRef.current);
          }
        });
      }
    };

    return (
      <div className="absolute top-1 right-1.5 z-10">
        <Tooltip content={isVisible ? "Hide value" : "Reveal value"}>
          <FontAwesomeIcon
            icon={isVisible ? faEyeSlash : faEye}
            className="cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-800 p-1.5 text-mineshaft-300 hover:bg-mineshaft-700"
            onClick={handleToggleVisibility}
          />
        </Tooltip>
      </div>
    );
  };

  const renderContent = () => {
    if (!isVisible) {
      return (
        <div className="font-mono text-sm break-words text-bunker-300">{HIDDEN_SECRET_VALUE}</div>
      );
    }

    // Show revealed value with diff highlighting if there are changes
    if (hasValueChanges) {
      if (isBothSingleLine) {
        return <SingleLineDiff oldText={oldValue} newText={newValue} isOldVersion={isOldVersion} />;
      }
      return <MultiLineDiff oldText={oldValue} newText={newValue} isOldVersion={isOldVersion} />;
    }

    return <div className="font-mono text-sm break-words whitespace-pre-wrap">{value}</div>;
  };

  const containerVariant = hasValueChanges ? variant : undefined;

  if (!value) {
    return <span className="text-sm text-mineshaft-300">-</span>;
  }

  return (
    <div className="relative">
      <DiffContainer variant={containerVariant} containerRef={containerRef} className="pr-8">
        {renderContent()}
      </DiffContainer>
      {renderVisibilityIcon()}
    </div>
  );
};

export const SecretDiffView = ({
  operationType,
  oldVersion,
  newVersion,
  oldVersionLabel = "Previous Secret",
  newVersionLabel = "New Secret"
}: SecretDiffViewProps) => {
  const oldDiffContainerRef = useRef<HTMLDivElement>(null);
  const newDiffContainerRef = useRef<HTMLDivElement>(null);
  const oldCommentDiffContainerRef = useRef<HTMLDivElement>(null);
  const newCommentDiffContainerRef = useRef<HTMLDivElement>(null);

  const oldSecretValue = oldVersion?.secretValue ?? "";
  const newSecretValue = newVersion?.secretValue ?? oldVersion?.secretValue ?? "";
  const hasValueChanges = oldSecretValue !== newSecretValue;
  const isBothSingleLine = isSingleLine(oldSecretValue) && isSingleLine(newSecretValue);

  const oldKey = oldVersion?.secretKey ?? "";
  const newKey = newVersion?.secretKey ?? "";
  const hasKeyChanges = oldKey !== newKey && oldKey !== "" && newKey !== "";

  const oldComment = oldVersion?.secretComment ?? "";
  const newComment = newVersion?.secretComment ?? "";
  const hasCommentChanges = oldComment !== newComment;

  const oldMultiline = String(oldVersion?.skipMultilineEncoding ?? false);
  const newMultiline = String(newVersion?.skipMultilineEncoding ?? false);
  const hasMultilineChanges = oldMultiline !== newMultiline;

  const oldTags = oldVersion?.tags ?? [];
  const newTags = newVersion?.tags ?? [];

  const showOldVersion = operationType === "update" || operationType === "delete";
  const showNewVersion = operationType === "update" || operationType === "create";

  return (
    <div className="flex flex-col space-y-4 space-x-0 xl:flex-row xl:space-y-0 xl:space-x-4">
      {showOldVersion ? (
        <div className="flex w-full min-w-0 cursor-default flex-col rounded-lg border border-red-600/60 bg-red-600/10 p-4 xl:w-1/2">
          <div className="mb-4 flex flex-row justify-between">
            <span className="text-md font-medium">{oldVersionLabel}</span>
            <div className="rounded-full bg-red px-2 pt-[0.2rem] pb-[0.14rem] text-xs font-medium">
              <FontAwesomeIcon icon={faCircleXmark} className="pr-1 text-white" />
              Previous
            </div>
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Key</div>
            <SingleLineTextDiffRenderer
              text={oldKey}
              oldText={oldKey}
              newText={newKey}
              hasChanges={hasKeyChanges}
              isOldVersion
            />
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Value</div>
            <SecretValueRenderer
              value={oldVersion?.secretValue}
              isValueHidden={oldVersion?.secretValueHidden}
              isOldVersion
              oldValue={oldSecretValue}
              newValue={newSecretValue}
              hasValueChanges={hasValueChanges}
              isBothSingleLine={isBothSingleLine}
              containerRef={oldDiffContainerRef}
            />
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Comment</div>
            <MultiLineTextDiffRenderer
              text={oldComment}
              oldText={oldComment}
              newText={newComment}
              hasChanges={hasCommentChanges}
              isOldVersion
              containerRef={oldCommentDiffContainerRef}
            />
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Tags</div>
            <TagsDiffRenderer
              tags={oldTags.map((tag) => ({ slug: tag.slug, color: tag.color ?? "" }))}
              otherTags={newTags.map((tag) => ({ slug: tag.slug, color: tag.color ?? "" }))}
              isOldVersion
            />
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Metadata</div>
            <MetadataDiffRenderer
              metadata={oldVersion?.secretMetadata}
              otherMetadata={newVersion?.secretMetadata}
              isOldVersion
            />
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Multi-line Encoding</div>
            <InlineTextDiff
              oldText={oldMultiline}
              newText={newMultiline}
              isOldVersion
              hasChanges={hasMultilineChanges}
              fontSize="sm"
            />
          </div>
        </div>
      ) : (
        <div className="flex w-full cursor-default flex-col items-center justify-center rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4 xl:w-1/2">
          <span className="text-sm text-mineshaft-400">
            Secret did not exist in the previous version.
          </span>
        </div>
      )}

      {showNewVersion ? (
        <div className="flex w-full min-w-0 cursor-default flex-col rounded-lg border border-green-600/60 bg-green-600/10 p-4 xl:w-1/2">
          <div className="mb-4 flex flex-row justify-between">
            <span className="text-md font-medium">{newVersionLabel}</span>
            <div className="rounded-full bg-green-600 px-2 pt-[0.2rem] pb-[0.14rem] text-xs font-medium">
              <FontAwesomeIcon icon={faCircleCheck} className="pr-1 text-white" />
              New
            </div>
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Key</div>
            <SingleLineTextDiffRenderer
              text={newKey}
              oldText={oldKey}
              newText={newKey}
              hasChanges={hasKeyChanges}
              isOldVersion={false}
            />
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Value</div>
            <SecretValueRenderer
              value={newVersion?.secretValue}
              oldValue={oldSecretValue}
              newValue={newSecretValue}
              isValueHidden={newVersion?.secretValueHidden}
              isOldVersion={false}
              hasValueChanges={hasValueChanges}
              isBothSingleLine={isBothSingleLine}
              containerRef={newDiffContainerRef}
            />
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Comment</div>
            <MultiLineTextDiffRenderer
              text={newComment}
              oldText={oldComment}
              newText={newComment}
              hasChanges={hasCommentChanges}
              isOldVersion={false}
              containerRef={newCommentDiffContainerRef}
            />
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Tags</div>
            <TagsDiffRenderer
              tags={newTags.map((tag) => ({ slug: tag.slug, color: tag.color ?? "" }))}
              otherTags={oldTags.map((tag) => ({ slug: tag.slug, color: tag.color ?? "" }))}
              isOldVersion={false}
            />
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Metadata</div>
            <MetadataDiffRenderer
              metadata={newVersion?.secretMetadata}
              otherMetadata={oldVersion?.secretMetadata}
              isOldVersion={false}
            />
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Multi-line Encoding</div>
            <InlineTextDiff
              oldText={oldMultiline}
              newText={newMultiline}
              isOldVersion={false}
              hasChanges={hasMultilineChanges}
              fontSize="sm"
            />
          </div>
        </div>
      ) : (
        <div className="flex w-full cursor-default flex-col items-center justify-center rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4 xl:w-1/2">
          <span className="text-sm text-mineshaft-400">Secret will be deleted.</span>
        </div>
      )}
    </div>
  );
};
