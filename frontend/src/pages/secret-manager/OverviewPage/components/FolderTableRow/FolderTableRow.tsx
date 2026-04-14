import { useState } from "react";
import { EditIcon, FolderIcon, InfoIcon, TrashIcon, Undo2Icon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Checkbox,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableIconButton,
  UnstableTableCell,
  UnstableTableRow
} from "@app/components/v3";
import { PendingAction } from "@app/hooks/api/secretFolders/types";

import { pendingActionBorderClass, pendingActionRowClass } from "../pendingActionStyles";
import { ResourceEnvironmentStatusCell } from "../ResourceEnvironmentStatusCell";

type Props = {
  folderName: string;
  description?: string;
  environments: { name: string; slug: string }[];
  isFolderPresentInEnv: (name: string, env: string) => boolean;
  onClick: (path: string) => void;
  isSelected: boolean;
  onToggleFolderSelect: (folderName: string) => void;
  onToggleFolderEdit: (name: string) => void;
  onToggleFolderDelete: (name: string) => void;
  pendingAction?: PendingAction;
  onBatchRevert?: (folderName: string) => void;
  isSelectionDisabled?: boolean;
};

export const FolderTableRow = ({
  folderName,
  description,
  environments = [],
  isFolderPresentInEnv,
  isSelected,
  onToggleFolderSelect,
  onToggleFolderEdit,
  onToggleFolderDelete,
  onClick,
  pendingAction,
  onBatchRevert,
  isSelectionDisabled
}: Props) => {
  const [isClicking, setIsClicking] = useState(false);
  const handleClick = () => {
    if (isClicking) return;

    setIsClicking(true);
    onClick(folderName);
    setTimeout(() => setIsClicking(false), 1000);
  };

  const isSingleEnvView = environments.length === 1;

  return (
    <UnstableTableRow
      className={twMerge("group hover:z-10", pendingActionRowClass(pendingAction))}
      onClick={handleClick}
    >
      <UnstableTableCell
        className={twMerge(
          isSingleEnvView
            ? ""
            : "sticky left-0 z-10 bg-container transition-colors duration-75 group-hover:bg-container-hover",
          pendingActionBorderClass(pendingAction)
        )}
      >
        <Checkbox
          variant="project"
          id={`checkbox-${folderName}`}
          isChecked={isSelected}
          onCheckedChange={() => {
            onToggleFolderSelect(folderName);
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
          className={twMerge(
            "hidden",
            !isSelectionDisabled && "group-hover:flex",
            isSelected && "flex"
          )}
        />
        <FolderIcon
          className={twMerge(
            "block text-folder",
            !isSelectionDisabled && "group-hover:!hidden",
            isSelected && "!hidden"
          )}
        />
      </UnstableTableCell>
      <UnstableTableCell
        isTruncatable
        colSpan={isSingleEnvView ? 2 : undefined}
        className={
          isSingleEnvView
            ? "relative transition-all duration-75"
            : "sticky left-10 z-10 border-r bg-container transition-all duration-75 group-hover:bg-container-hover"
        }
      >
        <span
          className={twMerge(
            pendingAction === PendingAction.Delete && "text-danger/75 line-through"
          )}
        >
          {folderName}
        </span>
        {description && (
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="mb-0.5 ml-1.5 inline-block !size-3 text-accent" />
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{description}</TooltipContent>
          </Tooltip>
        )}
        <div
          className={twMerge(
            "absolute z-20",
            "flex items-center rounded-md border border-border bg-container-hover px-0.5 py-0.5 shadow-md",
            "pointer-events-none opacity-0 transition-all duration-300",
            "group-hover:pointer-events-auto group-hover:gap-1 group-hover:opacity-100",
            isSingleEnvView
              ? "top-1/2 right-[2px] -translate-y-1/2"
              : "top-1/2 right-[3px] -translate-y-1/2"
          )}
        >
          {pendingAction !== PendingAction.Delete && (
            <Tooltip delayDuration={300} disableHoverableContent>
              <TooltipTrigger>
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7"
                  onClick={(e) => {
                    onToggleFolderEdit(folderName);
                    e.stopPropagation();
                  }}
                >
                  <EditIcon />
                </UnstableIconButton>
              </TooltipTrigger>
              <TooltipContent>Edit Folder</TooltipContent>
            </Tooltip>
          )}
          {pendingAction ? (
            <Tooltip delayDuration={300} disableHoverableContent>
              <TooltipTrigger>
                <UnstableIconButton
                  variant="ghost"
                  className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7 hover:text-danger"
                  size="xs"
                  onClick={(e) => {
                    onBatchRevert?.(folderName);
                    e.stopPropagation();
                  }}
                >
                  <Undo2Icon />
                </UnstableIconButton>
              </TooltipTrigger>
              <TooltipContent>Discard pending changes</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip delayDuration={300} disableHoverableContent>
              <TooltipTrigger>
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7 hover:text-danger"
                  onClick={(e) => {
                    onToggleFolderDelete(folderName);
                    e.stopPropagation();
                  }}
                >
                  <TrashIcon />
                </UnstableIconButton>
              </TooltipTrigger>
              <TooltipContent>Delete Folder</TooltipContent>
            </Tooltip>
          )}
        </div>
      </UnstableTableCell>
      {!isSingleEnvView &&
        environments.map(({ slug }, i) => {
          const isPresent = isFolderPresentInEnv(folderName, slug);

          return (
            <ResourceEnvironmentStatusCell
              key={`folder-${slug}-${i + 1}-value`}
              status={isPresent ? "present" : "missing"}
            />
          );
        })}
    </UnstableTableRow>
  );
};
