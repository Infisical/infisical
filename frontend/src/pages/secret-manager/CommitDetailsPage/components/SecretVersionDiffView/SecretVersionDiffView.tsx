/* eslint-disable no-nested-ternary */
import { useState } from "react";
import { FolderIcon, KeyRoundIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  FolderDiffView,
  FolderVersionData,
  SecretDiffView,
  SecretVersionData
} from "@app/components/secrets/diff";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Checkbox,
  IconButton,
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

export interface Version {
  id?: string;
  version: number;
  isRedacted?: boolean;
  redactedAt?: Date | null;
  redactedByUserId?: string | null;
  [key: string]: any;
}

export interface DiffViewItem {
  type: "secret" | "folder";
  isAdded?: boolean;
  isDeleted?: boolean;
  isUpdated?: boolean;
  versions?: Version[];
  isRollback?: boolean;
  id: string;
  secretKey?: string;
  folderName?: string;
}

interface SecretVersionDiffViewProps {
  item: DiffViewItem;
  isCollapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
  showHeader?: boolean;
  showViewed?: boolean;
  customHeader?: JSX.Element;
  onDiscard?: VoidFunction;
  headerExtra?: JSX.Element;
  onRevealOldValue?: () => Promise<void>;
  onRevealNewValue?: () => Promise<void>;
  isLoadingOldValue?: boolean;
  isLoadingNewValue?: boolean;
}

export const SecretVersionDiffView = ({
  item,
  isCollapsed = false,
  onToggleCollapse,
  showHeader = true,
  showViewed = false,
  customHeader,
  onDiscard,
  headerExtra,
  onRevealOldValue,
  onRevealNewValue,
  isLoadingOldValue,
  isLoadingNewValue
}: SecretVersionDiffViewProps) => {
  const [viewed, setViewed] = useState(false);
  const [internalValue, setInternalValue] = useState<string | undefined>(
    isCollapsed ? undefined : item.id
  );

  if (!item.versions || item.versions.length === 0) {
    return <div className="px-6 py-3 text-accent">No details available</div>;
  }

  const sortedVersions = [...item.versions].sort((a, b) => b.version - a.version);
  let oldVersion = null;
  let newVersion = null;

  let operationType: "create" | "update" | "delete" = "update";
  if (item.isAdded) operationType = "create";
  else if (item.isDeleted) operationType = "delete";

  if (item.isUpdated && sortedVersions.length >= 2) {
    if (item.isRollback) {
      [oldVersion, newVersion] = sortedVersions;
    } else {
      [newVersion, oldVersion] = sortedVersions;
    }
  } else if (item.isAdded) {
    [newVersion] = sortedVersions;
  } else if (item.isDeleted) {
    [oldVersion] = sortedVersions;
  } else {
    return null;
  }

  // Convert versions to SecretVersionData format for SecretDiffView
  const convertToSecretVersionData = (version: Version | null): SecretVersionData | undefined => {
    if (!version) return undefined;

    // Handle tags - normalize to string array (slugs only)
    let tags: { slug: string; color: string }[] | undefined;
    if (Array.isArray(version.tags)) {
      tags = version.tags.map((tag: { slug?: string; color?: string } | string) => {
        if (typeof tag === "string") {
          return { slug: tag, color: "" };
        }
        return { slug: tag.slug ?? "", color: tag.color ?? "" };
      });
    }

    const metadata = (version.metadata ?? version.secretMetadata) as
      | Array<{ key: string; value: string }>
      | undefined;

    return {
      isRedacted: version.isRedacted,
      secretKey: version.secretKey as string | undefined,
      secretValue: version.secretValue as string | undefined,
      secretValueHidden: version.secretValueHidden as boolean | undefined,
      secretComment: version.comment as string | undefined,
      tags,
      secretMetadata: metadata,
      skipMultilineEncoding: version.skipMultilineEncoding as boolean | undefined
    };
  };

  // Convert versions to FolderVersionData format for FolderDiffView
  const convertToFolderVersionData = (version: Version | null): FolderVersionData | undefined => {
    if (!version) return undefined;

    return {
      name: version.name as string | undefined,
      description: version.description as string | undefined
    };
  };

  const oldSecretData = convertToSecretVersionData(oldVersion);
  const newSecretData = convertToSecretVersionData(newVersion);

  const oldFolderData = convertToFolderVersionData(oldVersion);
  const newFolderData = convertToFolderVersionData(newVersion);

  const isSecret = item.type === "secret";
  const key = isSecret ? item.secretKey || "Unnamed Secret" : item.folderName || "Unnamed Folder";

  let changeBadgeVariant: "success" | "warning" | "danger" | undefined;
  let changeBadgeLabel: string | undefined;

  if (item.isDeleted) {
    changeBadgeVariant = "danger";
    changeBadgeLabel = "Deleted";
  } else if (item.isAdded) {
    changeBadgeVariant = "success";
    changeBadgeLabel = "Added";
  } else if (item.isUpdated) {
    changeBadgeVariant = "warning";
    changeBadgeLabel = "Updated";
  }

  const diffContent = (
    <div className="p-3">
      {item.type === "secret" ? (
        <SecretDiffView
          operationType={operationType}
          oldVersion={oldSecretData}
          newVersion={newSecretData}
          onRevealOldValue={onRevealOldValue}
          onRevealNewValue={onRevealNewValue}
          isLoadingOldValue={isLoadingOldValue}
          isLoadingNewValue={isLoadingNewValue}
        />
      ) : (
        <FolderDiffView
          operationType={operationType}
          oldVersion={oldFolderData}
          newVersion={newFolderData}
        />
      )}
    </div>
  );

  const handleViewedToggle = () => {
    const newViewed = !viewed;
    setViewed(newViewed);
    if (newViewed) {
      // Collapse when marking as viewed
      if (onToggleCollapse) {
        if (!isCollapsed) onToggleCollapse(item.id);
      } else {
        setInternalValue(undefined);
      }
    } else if (onToggleCollapse) {
      // Expand when unmarking as viewed
      if (isCollapsed) onToggleCollapse(item.id);
    } else {
      setInternalValue(item.id);
    }
  };

  // External controlled collapse (used by CommitDetailsTab)
  const accordionProps = onToggleCollapse
    ? {
        type: "single" as const,
        value: isCollapsed ? "" : item.id,
        onValueChange: () => onToggleCollapse(item.id)
      }
    : {
        type: "single" as const,
        value: internalValue ?? "",
        onValueChange: (val: string) => setInternalValue(val || undefined),
        collapsible: true as const
      };

  const TypeIcon = isSecret ? KeyRoundIcon : FolderIcon;

  return (
    <Accordion
      {...accordionProps}
      className={twMerge("overflow-clip rounded-md border border-border", viewed && "opacity-60")}
    >
      <AccordionItem value={item.id} className="border-b-0">
        {showHeader && (
          <AccordionTrigger className="min-h-10 overflow-hidden py-0">
            {customHeader ?? (
              <>
                <TypeIcon className="size-4 shrink-0 text-accent" />
                <span
                  className={twMerge(
                    "flex-1 truncate text-left",
                    item.isDeleted && "text-danger/85 line-through"
                  )}
                >
                  {key}
                </span>
                {changeBadgeLabel && <Badge variant={changeBadgeVariant}>{changeBadgeLabel}</Badge>}
                {headerExtra}
                {showViewed && (
                  <Label
                    className="cursor-pointer gap-1.5 border-l border-border pl-3 text-xs text-accent"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") e.stopPropagation();
                    }}
                  >
                    <Checkbox isChecked={viewed} onCheckedChange={handleViewedToggle} />
                    Viewed
                  </Label>
                )}
                {onDiscard && (
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <IconButton
                        variant="ghost"
                        size="xs"
                        className="hover:text-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDiscard();
                        }}
                      >
                        <TrashIcon />
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent side="left">Discard change</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
          </AccordionTrigger>
        )}
        <AccordionContent className="p-0">{diffContent}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
