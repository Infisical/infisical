import type { MouseEvent } from "react";
import { ChevronRightIcon, KeyIcon, SearchIcon } from "lucide-react";

import {
  Badge,
  RowLink,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

import { isPlainClick, QUICK_SEARCH_ROUTE } from "./quickSearchLink";
import { QuickSearchMetadata, QuickSearchMetadataList } from "./QuickSearchMetadataList";
import { QuickSearchSecretCopyButton } from "./QuickSearchSecretCopyButton";
import { QuickSearchSecretDetails } from "./QuickSearchSecretDetails";
import { QuickSearchSelection } from "./quickSearchTypes";

type Props = {
  secret: SecretV3RawSanitized;
  envSlug: string;
  onClose: (clearSearch?: boolean) => void;
  tags: string[];
  search: string;
  onSelectResult: (selection: QuickSearchSelection) => void;
  onApplyMetadataFilter: (metadata: QuickSearchMetadata) => void;
};

export const QuickSearchSecretItem = ({
  secret,
  envSlug,
  onClose,
  onSelectResult,
  onApplyMetadataFilter,
  tags,
  search
}: Props) => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    onSelectResult({ search: secret.key, tags });
    onClose(false);
  };

  const tagMatch =
    search.trim() &&
    secret.tags?.find((tag) => tag && tag.slug.toLowerCase().includes(search.toLowerCase()));

  const metadataMatch =
    search.trim() &&
    secret.secretMetadata?.find(
      (metadata) =>
        metadata &&
        (metadata.key.toLowerCase().includes(search.toLowerCase()) ||
          metadata.value.toLowerCase().includes(search.toLowerCase()))
    );

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
            secretPath: secret.path,
            search: secret.key,
            tags: undefined,
            filterBy: "secret",
            environments: [envSlug]
          })}
          onClick={handleClick}
        >
          <span className="font-medium">{secret.key}</span>
        </RowLink>
      </TableCell>
      <TableCell isTruncatable>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <span className="truncate text-foreground">{secret.path}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-lg">{secret.path}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>
        <QuickSearchMetadataList
          metadata={secret.secretMetadata}
          onApplyFilter={onApplyMetadataFilter}
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <QuickSearchSecretDetails tags={secret.tags} />
          {tagMatch && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="info">
                  <SearchIcon />
                  {tagMatch.slug}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Search matched tag</TooltipContent>
            </Tooltip>
          )}
          {metadataMatch && !tagMatch && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="info">
                  <SearchIcon />
                  Metadata
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Search matched metadata</TooltipContent>
            </Tooltip>
          )}
          <QuickSearchSecretCopyButton
            environment={secret.env}
            secretPath={secret.path ?? "/"}
            secretKey={secret.key}
            secretValueHidden={secret.secretValueHidden}
          />
          <ChevronRightIcon className="size-4 text-muted" />
        </div>
      </TableCell>
    </TableRow>
  );
};
