import { useState } from "react";
import { EditIcon, FolderIcon, InfoIcon, TrashIcon } from "lucide-react";
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
  onClick
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
    <UnstableTableRow className="group" onClick={handleClick}>
      <UnstableTableCell
        className={
          isSingleEnvView
            ? ""
            : "sticky left-0 z-10 bg-container transition-colors duration-75 group-hover:bg-container-hover"
        }
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
          className={twMerge("hidden group-hover:flex", isSelected && "flex")}
        />
        <FolderIcon
          className={twMerge("block text-folder group-hover:!hidden", isSelected && "!hidden")}
        />
      </UnstableTableCell>
      <UnstableTableCell
        isTruncatable
        colSpan={isSingleEnvView ? 2 : undefined}
        className={
          isSingleEnvView
            ? "relative"
            : "sticky left-10 z-10 border-r bg-container transition-all duration-75 group-hover:bg-container-hover group-hover:pr-16"
        }
      >
        {folderName}
        {description && (
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="mb-0.5 ml-1.5 inline-block !size-3 text-accent" />
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{description}</TooltipContent>
          </Tooltip>
        )}
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center transition-all duration-500 group-hover:space-x-1.5">
          <Tooltip delayDuration={300} disableHoverableContent>
            <TooltipTrigger>
              <UnstableIconButton
                variant="ghost"
                size="xs"
                className="w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100"
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
          <Tooltip delayDuration={300} disableHoverableContent>
            <TooltipTrigger>
              <UnstableIconButton
                variant="ghost"
                size="xs"
                className="w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100 hover:text-danger"
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
