import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, FolderIcon } from "lucide-react";

import { TableCell, TableRow, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { TSecretFolder } from "@app/hooks/api/secretFolders/types";

import { QuickSearchSelection } from "./quickSearchTypes";

type Props = {
  folder: TSecretFolder & { envId: string; path: string };
  envSlug: string;
  onClose: (clearSearch?: boolean) => void;
  onSelectResult: (selection: QuickSearchSelection) => void;
};

export const QuickSearchFolderItem = ({ folder, envSlug, onClose, onSelectResult }: Props) => {
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/secret-management/$projectId/overview"
  });

  const handleNavigate = () => {
    onSelectResult({ search: "" });
    navigate({
      search: (prev) => ({
        ...prev,
        search: undefined,
        tags: undefined,
        filterBy: undefined,
        secretPath: folder.path,
        environments: [envSlug]
      })
    });
    onClose(false);
  };

  return (
    <TableRow className="group cursor-pointer" onClick={handleNavigate}>
      <TableCell>
        <FolderIcon className="text-folder" />
      </TableCell>
      <TableCell isTruncatable>
        <span className="truncate font-medium">{folder.name}</span>
      </TableCell>
      <TableCell isTruncatable>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <span className="truncate text-foreground">{folder.path}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-lg">{folder.path}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="text-right">
        <ChevronRightIcon className="ml-auto size-4 text-muted" />
      </TableCell>
    </TableRow>
  );
};
