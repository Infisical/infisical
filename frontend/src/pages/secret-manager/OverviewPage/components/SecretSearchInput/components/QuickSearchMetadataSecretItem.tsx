import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, KeyIcon } from "lucide-react";

import { TableCell, TableRow, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { TMetadataMatchedSecret } from "@app/hooks/api/dashboard/types";

import { QuickSearchMetadata, QuickSearchMetadataList } from "./QuickSearchMetadataList";
import { QuickSearchSecretCopyButton } from "./QuickSearchSecretCopyButton";
import { QuickSearchSecretDetails } from "./QuickSearchSecretDetails";
import { QuickSearchSelection } from "./quickSearchTypes";

type Props = {
  secret: TMetadataMatchedSecret;
  envSlug: string;
  onClose: (clearSearch?: boolean) => void;
  onSelectResult: (selection: QuickSearchSelection) => void;
  onApplyMetadataFilter: (metadata: QuickSearchMetadata) => void;
};

export const QuickSearchMetadataSecretItem = ({
  secret,
  envSlug,
  onClose,
  onSelectResult,
  onApplyMetadataFilter
}: Props) => {
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/secret-management/$projectId/overview"
  });

  const handleNavigate = () => {
    onSelectResult({ search: secret.secretKey, tags: [] });
    navigate({
      search: (prev) => ({
        ...prev,
        secretPath: secret.secretPath,
        search: undefined,
        filterBy: "secret",
        environments: [envSlug],
        tags: undefined
      })
    });
    onClose(false);
  };

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
        <QuickSearchMetadataList metadata={secret.metadata} onApplyFilter={onApplyMetadataFilter} />
      </TableCell>
      <TableCell>
        <div className="ml-auto flex items-center justify-end gap-1">
          <QuickSearchSecretDetails tags={secret.tags} />
          <QuickSearchSecretCopyButton
            environment={envSlug}
            secretPath={secret.secretPath}
            secretKey={secret.secretKey}
            secretValueHidden={secret.secretValueHidden}
          />
          <ChevronRightIcon className="size-4 shrink-0 text-muted" />
        </div>
      </TableCell>
    </TableRow>
  );
};
