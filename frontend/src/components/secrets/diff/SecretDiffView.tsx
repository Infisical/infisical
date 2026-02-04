/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useRef, useState } from "react";
import { faCircleCheck, faCircleXmark, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { areValuesEqual, isSingleLine } from "@app/components/utilities/diff";
import { SecretInput, Tooltip } from "@app/components/v2";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

import { DiffContainer } from "./DiffContainer";
import { InlineTextDiff, MetadataDiffRenderer, TagsDiffRenderer } from "./FieldDiffRenderers";
import { MultiLineDiff } from "./MultiLineDiff";
import { SingleLineDiff } from "./SingleLineDiff";

export interface SecretVersionData {
  secretKey?: string;
  secretValue?: string;
  secretValueHidden?: boolean;
  secretComment?: string;
  tags?: Array<{ slug: string; color: string }>;
  secretMetadata?: Array<{ key: string; value: string }>;
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

  if (isValueHidden) {
    return (
      <div className="relative">
        <div className="absolute top-1/2 left-1 z-50 -translate-y-1/2">
          <Tooltip
            position="right"
            content={`You do not have access to view the ${isOldVersion ? "old" : "new"} secret value.`}
          >
            <FontAwesomeIcon className="pl-2 text-mineshaft-300" size="sm" icon={faEyeSlash} />
          </Tooltip>
        </div>
        <SecretInput
          isReadOnly
          isVisible={isVisible}
          valueAlwaysHidden={isValueHidden}
          value={HIDDEN_SECRET_VALUE}
          containerClassName="border border-mineshaft-600 bg-bunker-700 py-1.5 text-bunker-300 hover:border-primary-400/50 pr-2 pl-8"
        />
      </div>
    );
  }

  if (hasValueChanges) {
    const variant = isOldVersion ? "removed" : "added";
    if (isBothSingleLine) {
      return (
        <DiffContainer variant={variant} isSingleLine>
          <SingleLineDiff oldText={oldValue} newText={newValue} isOldVersion={isOldVersion} />
        </DiffContainer>
      );
    }

    return (
      <DiffContainer variant={variant} containerRef={containerRef}>
        <MultiLineDiff oldText={oldValue} newText={newValue} isOldVersion={isOldVersion} />
      </DiffContainer>
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
      <div className="absolute top-1 right-1" onClick={() => setIsVisible(!isVisible)}>
        <FontAwesomeIcon
          icon={isVisible ? faEyeSlash : faEye}
          className="cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-800 p-1.5 text-mineshaft-300 hover:bg-mineshaft-700"
        />
      </div>
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

  const oldSecretValue = oldVersion?.secretValue ?? "";
  const newSecretValue = newVersion?.secretValue ?? oldVersion?.secretValue ?? "";
  const hasValueChanges = !areValuesEqual(oldSecretValue, newSecretValue);
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
        <div className="flex w-full cursor-default flex-col rounded-lg border border-red-600/60 bg-red-600/10 p-4 xl:w-1/2">
          <div className="mb-4 flex flex-row justify-between">
            <span className="text-md font-medium">{oldVersionLabel}</span>
            <div className="rounded-full bg-red px-2 pt-[0.2rem] pb-[0.14rem] text-xs font-medium">
              <FontAwesomeIcon icon={faCircleXmark} className="pr-1 text-white" />
              Previous
            </div>
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Key</div>
            <InlineTextDiff
              oldText={oldKey}
              newText={newKey}
              isOldVersion
              hasChanges={hasKeyChanges}
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
            {oldComment ? (
              <div className="max-h-32 thin-scrollbar overflow-y-auto rounded border border-mineshaft-600 bg-bunker-800 p-2">
                <InlineTextDiff
                  oldText={oldComment}
                  newText={newComment}
                  isOldVersion
                  hasChanges={hasCommentChanges}
                  preserveWhitespace
                />
              </div>
            ) : (
              <span className="text-sm text-mineshaft-300">-</span>
            )}
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Tags</div>
            <TagsDiffRenderer
              tags={oldTags.map((tag) => ({ slug: tag.slug, color: tag.color }))}
              otherTags={newTags.map((tag) => ({ slug: tag.slug, color: tag.color }))}
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
        <div className="flex w-full cursor-default flex-col rounded-lg border border-green-600/60 bg-green-600/10 p-4 xl:w-1/2">
          <div className="mb-4 flex flex-row justify-between">
            <span className="text-md font-medium">{newVersionLabel}</span>
            <div className="rounded-full bg-green-600 px-2 pt-[0.2rem] pb-[0.14rem] text-xs font-medium">
              <FontAwesomeIcon icon={faCircleCheck} className="pr-1 text-white" />
              New
            </div>
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Key</div>
            <InlineTextDiff
              oldText={oldKey}
              newText={newKey}
              isOldVersion={false}
              hasChanges={hasKeyChanges}
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
            {newComment ? (
              <div className="max-h-32 thin-scrollbar overflow-y-auto rounded border border-mineshaft-600 bg-bunker-800 p-2">
                <InlineTextDiff
                  oldText={oldComment}
                  newText={newComment}
                  isOldVersion={false}
                  hasChanges={hasCommentChanges}
                  preserveWhitespace
                />
              </div>
            ) : (
              <span className="text-sm text-mineshaft-300">-</span>
            )}
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Tags</div>
            <TagsDiffRenderer
              tags={newTags.map((tag) => ({ slug: tag.slug, color: tag.color }))}
              otherTags={oldTags.map((tag) => ({ slug: tag.slug, color: tag.color }))}
              isOldVersion={false}
            />
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Metadata</div>
            <MetadataDiffRenderer
              metadata={newVersion?.secretMetadata ?? oldVersion?.secretMetadata}
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
