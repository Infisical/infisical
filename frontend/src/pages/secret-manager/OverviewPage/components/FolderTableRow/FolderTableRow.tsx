import { useState } from "react";
import { EditIcon, FolderIcon } from "lucide-react";
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
  environments: { name: string; slug: string }[];
  isFolderPresentInEnv: (name: string, env: string) => boolean;
  onClick: (path: string) => void;
  isSelected: boolean;
  onToggleFolderSelect: (folderName: string) => void;
  onToggleFolderEdit: (name: string) => void;
};

export const FolderTableRow = ({
  folderName,
  environments = [],
  isFolderPresentInEnv,
  isSelected,
  onToggleFolderSelect,
  onToggleFolderEdit,
  onClick
}: Props) => {
  const [isClicking, setIsClicking] = useState(false);
  const handleClick = () => {
    if (isClicking) return;

    setIsClicking(true);
    onClick(folderName);
    setTimeout(() => setIsClicking(false), 1000);
  };
  return (
    <UnstableTableRow className="group" onClick={handleClick}>
      <UnstableTableCell className="sticky left-0 z-10 bg-container transition-colors duration-75 group-hover:bg-container-hover">
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
        className="sticky left-10 z-10 border-r bg-container transition-all duration-75 group-hover:bg-container-hover group-hover:pr-9"
      >
        {folderName}
        <Tooltip>
          <TooltipTrigger asChild>
            <UnstableIconButton
              variant="ghost"
              size="xs"
              className="absolute top-1/2 right-2 -translate-y-1/2 opacity-0 transition-all duration-75 group-hover:opacity-100"
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
      </UnstableTableCell>
      {environments.map(({ slug }, i) => {
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
