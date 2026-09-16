import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, KeyIcon, SearchIcon } from "lucide-react";

import {
  Badge,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

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
};

export const QuickSearchSecretItem = ({
  secret,
  envSlug,
  onClose,
  onSelectResult,
  tags,
  search
}: Props) => {
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/secret-management/$projectId/overview"
  });

  const handleNavigate = () => {
    onSelectResult({ search: secret.key, tags });
    navigate({
      search: (prev) => ({
        ...prev,
        secretPath: secret.path,
        search: undefined,
        tags: undefined,
        filterBy: "secret",
        environments: [envSlug]
      })
    });
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
    <TableRow className="group cursor-pointer" onClick={handleNavigate}>
      <TableCell>
        <KeyIcon className="text-secret" />
      </TableCell>
      <TableCell isTruncatable>
        <span className="truncate font-medium">{secret.key}</span>
      </TableCell>
      <TableCell isTruncatable>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <span className="truncate text-foreground">{secret.path}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-lg">{secret.path}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <QuickSearchSecretDetails tags={secret.tags} metadata={secret.secretMetadata} />
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
