import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, KeyIcon } from "lucide-react";

import {
  Badge,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TMetadataMatchedSecret } from "@app/hooks/api/dashboard/types";

type Props = {
  secret: TMetadataMatchedSecret;
  envSlug: string;
  onClose: () => void;
};

const MAX_VISIBLE_BADGES = 3;

export const QuickSearchMetadataSecretItem = ({ secret, envSlug, onClose }: Props) => {
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/secret-management/$projectId/overview"
  });

  const handleNavigate = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        secretPath: secret.secretPath,
        search: secret.secretKey,
        filterBy: "secret",
        environments: [envSlug],
        tags: undefined
      })
    });
    onClose();
  };

  const visibleMetadata = secret.metadata.slice(0, MAX_VISIBLE_BADGES);
  const overflowCount = secret.metadata.length - visibleMetadata.length;

  return (
    <TableRow className="group cursor-pointer" onClick={handleNavigate}>
      <TableCell>
        <KeyIcon className="text-secret" />
      </TableCell>
      <TableCell isTruncatable>
        <span className="truncate font-medium">{secret.secretKey}</span>
      </TableCell>
      <TableCell isTruncatable>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <span className="truncate text-foreground">{secret.secretPath}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-lg">{secret.secretPath}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {visibleMetadata.map((meta) => (
            <Badge
              key={`${meta.key}-${meta.value}`}
              variant="outline"
              className="gap-1.5 border-border font-mono font-normal"
            >
              <span className="text-muted">{meta.key}</span>
              <span className="text-foreground">{meta.value ?? ""}</span>
            </Badge>
          ))}
          {overflowCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="border-border font-mono font-normal text-muted">
                  {`+${overflowCount}`}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-lg">
                {secret.metadata
                  .slice(MAX_VISIBLE_BADGES)
                  .map((meta) => `${meta.key}=${meta.value ?? ""}`)
                  .join(", ")}
              </TooltipContent>
            </Tooltip>
          )}
          <ChevronRightIcon className="ml-auto size-4 shrink-0 text-muted" />
        </div>
      </TableCell>
    </TableRow>
  );
};
