import type { MouseEvent } from "react";
import { ChevronRightIcon, KeyIcon } from "lucide-react";

import {
  RowLink,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TMetadataMatchedSecret } from "@app/hooks/api/dashboard/types";

import { isPlainClick, QUICK_SEARCH_ROUTE } from "./quickSearchLink";
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
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    onSelectResult({ search: secret.secretKey, tags: [] });
    onClose(false);
  };

  return (
    <TableRow linked>
      <TableCell>
        <KeyIcon className="text-secret" />
      </TableCell>
      <TableCell isTruncatable>
        <RowLink
          from={QUICK_SEARCH_ROUTE}
          to="."
          search={(prev) => ({
            ...prev,
            secretPath: secret.secretPath,
            search: secret.secretKey,
            filterBy: "secret",
            environments: [envSlug],
            tags: undefined
          })}
          onClick={handleClick}
        >
          <span className="font-medium">{secret.secretKey}</span>
        </RowLink>
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
