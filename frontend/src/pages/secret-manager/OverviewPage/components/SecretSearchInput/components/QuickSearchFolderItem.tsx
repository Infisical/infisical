import type { MouseEvent } from "react";
import { ChevronRightIcon, FolderIcon } from "lucide-react";

import {
  RowLink,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TSecretFolder } from "@app/hooks/api/secretFolders/types";

import { isPlainClick, QUICK_SEARCH_ROUTE } from "./quickSearchLink";
import { QuickSearchSelection } from "./quickSearchTypes";

type Props = {
  folder: TSecretFolder & { envId: string; path: string };
  envSlug: string;
  onClose: (clearSearch?: boolean) => void;
  onSelectResult: (selection: QuickSearchSelection) => void;
};

export const QuickSearchFolderItem = ({ folder, envSlug, onClose, onSelectResult }: Props) => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    onSelectResult({ search: "" });
    onClose(false);
  };

  return (
    <TableRow linked>
      <TableCell>
        <FolderIcon className="text-folder" />
      </TableCell>
      <TableCell isTruncatable>
        <RowLink
          from={QUICK_SEARCH_ROUTE}
          to="."
          search={(prev) => ({
            ...prev,
            search: undefined,
            tags: undefined,
            filterBy: undefined,
            secretPath: folder.path,
            environments: [envSlug],
            clearSearch: true
          })}
          onClick={handleClick}
        >
          <span className="font-medium">{folder.name}</span>
        </RowLink>
      </TableCell>
      <TableCell isTruncatable>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <span className="truncate text-foreground">{folder.path}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-lg">{folder.path}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="text-muted">—</TableCell>
      <TableCell className="text-right">
        <ChevronRightIcon className="ml-auto size-4 text-muted" />
      </TableCell>
    </TableRow>
  );
};
