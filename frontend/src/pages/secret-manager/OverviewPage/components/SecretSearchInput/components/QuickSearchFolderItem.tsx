import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, FolderIcon } from "lucide-react";

import { TableCell, TableRow, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
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
