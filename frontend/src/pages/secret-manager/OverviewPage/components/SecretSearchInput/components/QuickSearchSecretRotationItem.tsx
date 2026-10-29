import type { MouseEvent } from "react";
import { ChevronRightIcon, RefreshCwIcon } from "lucide-react";

import {
  RowLink,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";

import { isPlainClick, QUICK_SEARCH_ROUTE } from "./quickSearchLink";
import { QuickSearchSelection } from "./quickSearchTypes";

type Props = {
  secretRotation: TSecretRotationV2;
  envSlug: string;
  onClose: (clearSearch?: boolean) => void;
  onSelectResult: (selection: QuickSearchSelection) => void;
};

export const QuickSearchSecretRotationItem = ({
  secretRotation,
  envSlug,
  onClose,
  onSelectResult
}: Props) => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    onSelectResult({ search: secretRotation.name });
    onClose(false);
  };

  return (
    <TableRow linked>
      <TableCell>
        <RefreshCwIcon className="text-secret-rotation" />
      </TableCell>
      <TableCell isTruncatable>
        <RowLink
          from={QUICK_SEARCH_ROUTE}
          to="."
          search={(prev) => ({
            ...prev,
            secretPath: secretRotation.folder.path,
            search: secretRotation.name,
            tags: undefined,
            filterBy: "rotation",
            environments: [envSlug]
          })}
          onClick={handleClick}
        >
          <span className="font-medium">{secretRotation.name}</span>
        </RowLink>
      </TableCell>
      <TableCell isTruncatable>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <span className="truncate text-foreground">{secretRotation.folder.path}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-lg">{secretRotation.folder.path}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="text-muted">—</TableCell>
      <TableCell className="text-right">
        <ChevronRightIcon className="ml-auto size-4 text-muted" />
      </TableCell>
    </TableRow>
  );
};
