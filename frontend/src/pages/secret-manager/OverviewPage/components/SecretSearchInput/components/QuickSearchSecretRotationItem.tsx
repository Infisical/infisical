import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, RefreshCwIcon } from "lucide-react";

import { TableCell, TableRow, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";

type Props = {
  secretRotation: TSecretRotationV2;
  envSlug: string;
  onClose: () => void;
};

export const QuickSearchSecretRotationItem = ({ secretRotation, envSlug, onClose }: Props) => {
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/secret-management/$projectId/overview"
  });

  const handleNavigate = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        secretPath: secretRotation.folder.path,
        search: secretRotation.name,
        filterBy: "rotation",
        environments: [envSlug]
      })
    });
    onClose();
  };

  return (
    <TableRow className="group cursor-pointer" onClick={handleNavigate}>
      <TableCell>
        <RefreshCwIcon className="text-secret-rotation" />
      </TableCell>
      <TableCell isTruncatable>
        <span className="truncate font-medium">{secretRotation.name}</span>
      </TableCell>
      <TableCell isTruncatable>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <span className="truncate text-foreground">{secretRotation.folder.path}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-lg">{secretRotation.folder.path}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="text-right">
        <ChevronRightIcon className="ml-auto size-4 text-muted" />
      </TableCell>
    </TableRow>
  );
};
