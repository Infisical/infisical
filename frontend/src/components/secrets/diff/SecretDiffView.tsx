/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useRef, useState } from "react";
import { EyeIcon, EyeOffIcon, TriangleAlertIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { isSingleLine, scrollToFirstChange } from "@app/components/utilities/diff";
import {
  Badge,
  IconButton,
  Tooltip as V3Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  HIDDEN_SECRET_VALUE,
  HIDDEN_SECRET_VALUE_API_MASK
} from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

import { DiffContainer } from "./DiffContainer";
import { DiffPaneField, DiffPanes } from "./DiffPanes";
import {
  getSecretFieldChanges,
  SECRET_FIELD_LABELS,
  SECRET_FIELD_ORDER,
  SecretFieldKey
} from "./fieldChanges";
import {
  InlineTextDiff,
  MetadataDiffRenderer,
  MultiLineTextDiffRenderer,
  SingleLineTextDiffRenderer,
  TagsDiffRenderer
} from "./FieldDiffRenderers";
import { MultiLineDiff } from "./MultiLineDiff";
import { SingleLineDiff } from "./SingleLineDiff";
import { SecretVersionData } from "./types";

export interface SecretDiffViewProps {
  operationType: "create" | "update" | "delete";
  oldVersion?: SecretVersionData;
  newVersion?: SecretVersionData;
  onRevealOldValue?: () => Promise<void>;
  onRevealNewValue?: () => Promise<void>;
  isLoadingOldValue?: boolean;
  isLoadingNewValue?: boolean;
  /** Completes the "Previous …" / "New …" pane titles. */
  resourceLabel?: string;
  /** Flags each changed property, for when the panes show unchanged properties too. */
  showChangedMarkers?: boolean;
  /** Narrows the panes to these properties, in display order. Defaults to every property. */
  visibleFields?: SecretFieldKey[];
}

export const SecretValueRenderer = ({
  isOldVersion,
  isValueHidden,
  value,
  hasValueChanges,
  isBothSingleLine,
  oldValue,
  newValue,
  containerRef,
  onReveal,
  isLoading
}: {
  isOldVersion: boolean;
  isValueHidden?: boolean;
  value?: string;
  hasValueChanges: boolean;
  isBothSingleLine: boolean;
  oldValue: string;
  newValue: string;
  containerRef: React.RefObject<HTMLDivElement>;
  onReveal?: () => Promise<void>;
  isLoading?: boolean;
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const variant = isOldVersion ? "removed" : "added";

  // Visibility toggle icon - shown when user can reveal value, or access denied indicator
  const renderVisibilityIcon = () => {
    if (isValueHidden) {
      return (
        <div className="absolute top-3 right-3 z-10">
          <V3Tooltip>
            <TooltipTrigger asChild>
              <EyeOffIcon className="size-3.5 text-muted" />
            </TooltipTrigger>
            <TooltipContent side="top">
              You do not have access to view the {isOldVersion ? "old" : "new"} secret value.
            </TooltipContent>
          </V3Tooltip>
        </div>
      );
    }
    const handleToggleVisibility = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const newVisibility = !isVisible;

      if (newVisibility && onReveal) {
        await onReveal();
      }

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
      <div className="absolute top-[5px] right-1.5 z-10">
        <V3Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              variant="ghost"
              size="xs"
              className={twMerge(
                isLoading ? "animate-pulse" : "",
                isOldVersion ? "bg-[#161518]/80" : "bg-[#121819]/80"
              )}
              onClick={handleToggleVisibility}
            >
              {isVisible ? <EyeOffIcon /> : <EyeIcon />}
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>{isVisible ? "Hide value" : "Reveal value"}</TooltipContent>
        </V3Tooltip>
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading || !isVisible || value === HIDDEN_SECRET_VALUE_API_MASK) {
      return <div className="font-mono text-sm break-words text-label">{HIDDEN_SECRET_VALUE}</div>;
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

  if (!value && !(value === HIDDEN_SECRET_VALUE_API_MASK)) {
    return <span className="text-sm text-muted">&mdash;</span>;
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
  onRevealOldValue,
  onRevealNewValue,
  isLoadingOldValue,
  isLoadingNewValue,
  resourceLabel = "Secret",
  showChangedMarkers,
  visibleFields = SECRET_FIELD_ORDER
}: SecretDiffViewProps) => {
  const oldDiffContainerRef = useRef<HTMLDivElement>(null);
  const newDiffContainerRef = useRef<HTMLDivElement>(null);
  const oldCommentDiffContainerRef = useRef<HTMLDivElement>(null);
  const newCommentDiffContainerRef = useRef<HTMLDivElement>(null);

  const changes = getSecretFieldChanges(oldVersion, newVersion);

  const oldSecretValue = oldVersion?.secretValue ?? "";
  const newSecretValue = newVersion?.secretValue ?? oldVersion?.secretValue ?? "";
  const isBothSingleLine = isSingleLine(oldSecretValue) && isSingleLine(newSecretValue);

  const oldKey = oldVersion?.secretKey ?? "";
  const newKey = newVersion?.secretKey ?? "";

  const oldComment = oldVersion?.secretComment ?? "";
  const newComment = newVersion?.secretComment ?? "";

  const oldMultiline = String(oldVersion?.skipMultilineEncoding ?? false);
  const newMultiline = String(newVersion?.skipMultilineEncoding ?? false);

  const oldTags = oldVersion?.tags ?? [];
  const newTags = newVersion?.tags ?? [];

  const fieldByKey: Record<SecretFieldKey, DiffPaneField> = {
    secretKey: {
      key: "secretKey",
      label: SECRET_FIELD_LABELS.secretKey,
      hasChanges: changes.secretKey,
      previous: (
        <SingleLineTextDiffRenderer
          text={oldKey}
          oldText={oldKey}
          newText={newKey}
          hasChanges={changes.secretKey}
          isOldVersion
        />
      ),
      next: (
        <SingleLineTextDiffRenderer
          text={newKey}
          oldText={oldKey}
          newText={newKey}
          hasChanges={changes.secretKey}
          isOldVersion={false}
        />
      )
    },
    secretValue: {
      key: "secretValue",
      label: SECRET_FIELD_LABELS.secretValue,
      hasChanges: changes.secretValue,
      previous: (
        <SecretValueRenderer
          value={oldVersion?.secretValue}
          isValueHidden={oldVersion?.secretValueHidden}
          isOldVersion
          oldValue={oldSecretValue}
          newValue={newSecretValue}
          hasValueChanges={changes.secretValue}
          isBothSingleLine={isBothSingleLine}
          containerRef={oldDiffContainerRef}
          onReveal={onRevealOldValue}
          isLoading={isLoadingOldValue}
        />
      ),
      next: (
        <SecretValueRenderer
          value={newVersion?.secretValue}
          isValueHidden={newVersion?.secretValueHidden}
          isOldVersion={false}
          oldValue={oldSecretValue}
          newValue={newSecretValue}
          hasValueChanges={changes.secretValue}
          isBothSingleLine={isBothSingleLine}
          containerRef={newDiffContainerRef}
          onReveal={onRevealNewValue}
          isLoading={isLoadingNewValue}
        />
      )
    },
    secretComment: {
      key: "secretComment",
      label: SECRET_FIELD_LABELS.secretComment,
      hasChanges: changes.secretComment,
      previous: (
        <MultiLineTextDiffRenderer
          text={oldComment}
          oldText={oldComment}
          newText={newComment}
          hasChanges={changes.secretComment}
          isOldVersion
          containerRef={oldCommentDiffContainerRef}
        />
      ),
      next: (
        <MultiLineTextDiffRenderer
          text={newComment}
          oldText={oldComment}
          newText={newComment}
          hasChanges={changes.secretComment}
          isOldVersion={false}
          containerRef={newCommentDiffContainerRef}
        />
      )
    },
    tags: {
      key: "tags",
      label: SECRET_FIELD_LABELS.tags,
      hasChanges: changes.tags,
      previous: (
        <TagsDiffRenderer
          tags={oldTags.map((tag) => ({ slug: tag.slug, color: tag.color ?? "" }))}
          otherTags={newTags.map((tag) => ({ slug: tag.slug, color: tag.color ?? "" }))}
          isOldVersion
        />
      ),
      next: (
        <TagsDiffRenderer
          tags={newTags.map((tag) => ({ slug: tag.slug, color: tag.color ?? "" }))}
          otherTags={oldTags.map((tag) => ({ slug: tag.slug, color: tag.color ?? "" }))}
          isOldVersion={false}
        />
      )
    },
    secretMetadata: {
      key: "secretMetadata",
      label: SECRET_FIELD_LABELS.secretMetadata,
      hasChanges: changes.secretMetadata,
      previous: (
        <MetadataDiffRenderer
          metadata={oldVersion?.secretMetadata}
          otherMetadata={newVersion?.secretMetadata}
          isOldVersion
        />
      ),
      next: (
        <MetadataDiffRenderer
          metadata={newVersion?.secretMetadata}
          otherMetadata={oldVersion?.secretMetadata}
          isOldVersion={false}
        />
      )
    },
    skipMultilineEncoding: {
      key: "skipMultilineEncoding",
      label: SECRET_FIELD_LABELS.skipMultilineEncoding,
      hasChanges: changes.skipMultilineEncoding,
      previous: (
        <InlineTextDiff
          oldText={oldMultiline}
          newText={newMultiline}
          isOldVersion
          hasChanges={changes.skipMultilineEncoding}
          fontSize="sm"
        />
      ),
      next: (
        <InlineTextDiff
          oldText={oldMultiline}
          newText={newMultiline}
          isOldVersion={false}
          hasChanges={changes.skipMultilineEncoding}
          fontSize="sm"
        />
      )
    }
  };

  return (
    <DiffPanes
      operationType={operationType}
      fields={visibleFields.map((field) => fieldByKey[field])}
      resourceLabel={resourceLabel}
      showChangedMarkers={showChangedMarkers}
      previousEmptyMessage="Secret did not exist in the previous version."
      nextEmptyMessage="Secret will be deleted."
      newPaneBadge={
        newVersion?.isRedacted && (
          <V3Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="danger">
                <TriangleAlertIcon /> Redacted Version
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top">
              This secret version has been redacted. Rolling back to this version will result in an
              empty secret value.
            </TooltipContent>
          </V3Tooltip>
        )
      }
    />
  );
};
