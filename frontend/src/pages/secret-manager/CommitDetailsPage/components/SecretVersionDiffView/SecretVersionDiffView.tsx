/* eslint-disable no-nested-ternary */
import { useCallback, useState } from "react";
import { faChevronDown, faChevronUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import {
  FolderDiffView,
  FolderVersionData,
  SecretDiffView,
  SecretVersionData
} from "@app/components/secrets/diff";
import { IconButton, Tooltip } from "@app/components/v2";

export interface Version {
  id?: string;
  version: number;
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
  customHeader,
  onDiscard,
  headerExtra,
  onRevealOldValue,
  onRevealNewValue,
  isLoadingOldValue,
  isLoadingNewValue
}: SecretVersionDiffViewProps) => {
  const [internalCollapsed, setInternalCollapsed] = useState(isCollapsed);

  const handleToggle = useCallback(() => {
    if (onToggleCollapse && item.id) {
      onToggleCollapse(item.id);
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  }, [onToggleCollapse, item.id]);

  const collapsed = onToggleCollapse ? isCollapsed : internalCollapsed;

  if (!item.versions || item.versions.length === 0) {
    return <div className="px-6 py-3 text-gray-400">No details available</div>;
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

  const renderHeader = () => {
    if (customHeader) {
      return customHeader;
    }

    const isSecret = item.type === "secret";
    const key = isSecret ? item.secretKey || "Unnamed Secret" : item.folderName || "Unnamed Folder";
    let textStyle = "text-white";
    let changeBadge = null;

    if (item.isDeleted) {
      textStyle = "line-through text-red-300";
      changeBadge = (
        <span className="ml-2 rounded-md bg-mineshaft-600 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
          {isSecret ? "Secret" : "Folder"} Deleted
        </span>
      );
    } else if (item.isAdded) {
      changeBadge = (
        <span className="ml-2 rounded-md bg-mineshaft-600 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
          {isSecret ? "Secret" : "Folder"} Added
        </span>
      );
    } else if (item.isUpdated) {
      changeBadge = (
        <span className="ml-2 rounded-md bg-mineshaft-600 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
          {isSecret ? "Secret" : "Folder"} Updated
        </span>
      );
    }

    return (
      <div
        className="flex cursor-pointer items-center justify-between p-4 hover:bg-mineshaft-700"
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            handleToggle();
            e.preventDefault();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
      >
        <div className="flex min-w-0 flex-1 items-center">
          <p className={twMerge(textStyle, "truncate")}>{key}</p>
          {changeBadge}
          {headerExtra}
        </div>
        {onDiscard && (
          <Tooltip side="left" content="Discard change">
            <IconButton
              ariaLabel="discard-change"
              variant="plain"
              colorSchema="danger"
              size="sm"
              className="ml-2"
              onClick={onDiscard}
            >
              <FontAwesomeIcon icon={faTrash} />
            </IconButton>
          </Tooltip>
        )}
        <FontAwesomeIcon
          icon={collapsed ? faChevronDown : faChevronUp}
          className="ml-2 text-gray-400"
        />
      </div>
    );
  };

  return (
    <div className="overflow-hidden border border-b-0 border-mineshaft-600 bg-mineshaft-800 first:rounded-t last:rounded-b last:border-b">
      {showHeader && renderHeader()}
      {!collapsed && (
        <div className="border-t border-mineshaft-700 bg-mineshaft-900 p-3 text-mineshaft-100">
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
      )}
    </div>
  );
};
