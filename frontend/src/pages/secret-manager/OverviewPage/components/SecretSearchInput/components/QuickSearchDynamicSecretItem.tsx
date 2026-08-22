import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, FingerprintIcon } from "lucide-react";

import { TableCell, TableRow, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

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
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/secret-management/$projectId/overview"
  });

  const handleNavigate = () => {
    onSelectResult({ search: dynamicSecret.name });
    navigate({
      search: (prev) => ({
        ...prev,
        secretPath: dynamicSecret.path,
        search: undefined,
        tags: undefined,
        filterBy: "dynamic",
        environments: [envSlug]
      })
    });
    onClose(false);
  };

  return (
    <TableRow className="group cursor-pointer" onClick={handleNavigate}>
      <TableCell>
        <FingerprintIcon className="text-dynamic-secret" />
      </TableCell>
      <TableCell isTruncatable>
        <span className="truncate font-medium">{dynamicSecret.name}</span>
      </TableCell>
      <TableCell isTruncatable>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <span className="truncate text-foreground">{dynamicSecret.path}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-lg">{dynamicSecret.path}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="text-right">
        <ChevronRightIcon className="ml-auto size-4 text-muted" />
      </TableCell>
    </TableRow>
  );
};
