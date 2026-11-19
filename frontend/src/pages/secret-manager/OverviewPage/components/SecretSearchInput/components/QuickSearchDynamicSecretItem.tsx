import type { MouseEvent } from "react";
import { ChevronRightIcon, FingerprintIcon } from "lucide-react";

import {
  RowLink,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

import { isPlainClick, QUICK_SEARCH_ROUTE } from "./quickSearchLink";
import { QuickSearchSelection } from "./quickSearchTypes";

type Props = {
  dynamicSecret: TDynamicSecret & { environment: string; path: string };
  envSlug: string;
  onClose: (clearSearch?: boolean) => void;
  onSelectResult: (selection: QuickSearchSelection) => void;
};

export const QuickSearchDynamicSecretItem = ({
  dynamicSecret,
  envSlug,
  onClose,
  onSelectResult
}: Props) => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    onSelectResult({ search: dynamicSecret.name });
    onClose(false);
  };

  return (
    <TableRow linked>
      <TableCell>
        <FingerprintIcon className="text-dynamic-secret" />
      </TableCell>
      <TableCell isTruncatable>
        <RowLink
          from={QUICK_SEARCH_ROUTE}
          to="."
          search={(prev) => ({
            ...prev,
            secretPath: dynamicSecret.path,
            search: dynamicSecret.name,
            tags: undefined,
            filterBy: "dynamic",
            environments: [envSlug]
          })}
          onClick={handleClick}
        >
          <span className="font-medium">{dynamicSecret.name}</span>
        </RowLink>
      </TableCell>
      <TableCell isTruncatable>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <span className="truncate text-foreground">{dynamicSecret.path}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-lg">{dynamicSecret.path}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="text-muted">—</TableCell>
      <TableCell className="text-right">
        <ChevronRightIcon className="ml-auto size-4 text-muted" />
      </TableCell>
    </TableRow>
  );
};
