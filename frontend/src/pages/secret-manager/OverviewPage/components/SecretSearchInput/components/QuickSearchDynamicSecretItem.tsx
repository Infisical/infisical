import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, FingerprintIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableTableCell,
  UnstableTableRow
} from "@app/components/v3";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

type Props = {
  dynamicSecret: TDynamicSecret & { environment: string; path: string };
  envSlug: string;
  onClose: () => void;
};

export const QuickSearchDynamicSecretItem = ({ dynamicSecret, envSlug, onClose }: Props) => {
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/secret-management/$projectId/overview"
  });

  const handleNavigate = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        secretPath: dynamicSecret.path,
        search: dynamicSecret.name,
        filterBy: "dynamic",
        environments: [envSlug]
      })
    });
    onClose();
  };

  return (
    <UnstableTableRow className="group cursor-pointer" onClick={handleNavigate}>
      <UnstableTableCell>
        <FingerprintIcon className="text-dynamic-secret" />
      </UnstableTableCell>
      <UnstableTableCell isTruncatable>
        <span className="truncate font-medium">{dynamicSecret.name}</span>
      </UnstableTableCell>
      <UnstableTableCell isTruncatable>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <span className="truncate text-foreground">{dynamicSecret.path}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-lg">{dynamicSecret.path}</TooltipContent>
        </Tooltip>
      </UnstableTableCell>
      <UnstableTableCell className="text-right">
        <ChevronRightIcon className="ml-auto size-4 text-muted" />
      </UnstableTableCell>
    </UnstableTableRow>
  );
};
