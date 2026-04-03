import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, FolderIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableTableCell,
  UnstableTableRow
} from "@app/components/v3";
import { TSecretFolder } from "@app/hooks/api/secretFolders/types";

type Props = {
  folder: TSecretFolder & { envId: string; path: string };
  envSlug: string;
  onClose: () => void;
};

export const QuickSearchFolderItem = ({ folder, envSlug, onClose }: Props) => {
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/secret-management/$projectId/overview"
  });

  const handleNavigate = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        search: "",
        filterBy: undefined,
        secretPath: folder.path,
        environments: [envSlug]
      })
    });
    onClose();
  };

  return (
    <UnstableTableRow className="group cursor-pointer" onClick={handleNavigate}>
      <UnstableTableCell>
        <FolderIcon className="text-folder" />
      </UnstableTableCell>
      <UnstableTableCell isTruncatable>
        <span className="truncate font-medium">{folder.name}</span>
      </UnstableTableCell>
      <UnstableTableCell isTruncatable>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <span className="truncate text-foreground">{folder.path}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-lg">{folder.path}</TooltipContent>
        </Tooltip>
      </UnstableTableCell>
      <UnstableTableCell className="text-right">
        <ChevronRightIcon className="ml-auto size-4 text-muted" />
      </UnstableTableCell>
    </UnstableTableRow>
  );
};
