import { useNavigate } from "@tanstack/react-router";
import { CheckIcon, ChevronRightIcon, CopyIcon, KeyIcon, SearchIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  IconButton,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { fetchSecretValue } from "@app/hooks/api/dashboard/queries";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

type Props = {
  secret: SecretV3RawSanitized;
  envSlug: string;
  onClose: () => void;
  tags: string[];
  search: string;
};

export const QuickSearchSecretItem = ({ secret, envSlug, onClose, tags, search }: Props) => {
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/secret-management/$projectId/overview"
  });
  const [isUrlCopied, , setIsUrlCopied] = useTimedReset<boolean>({
    initialState: false
  });

  const { currentProject } = useProject();

  const handleNavigate = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        secretPath: secret.path,
        search: secret.key,
        tags: tags.length ? tags.join(",") : undefined,
        filterBy: "secret",
        environments: [envSlug]
      })
    });
    onClose();
  };

  const handleCopy = async () => {
    try {
      const data = await fetchSecretValue({
        environment: secret.env,
        secretPath: secret.path!,
        secretKey: secret.key,
        projectId: currentProject.id
      });

      navigator.clipboard.writeText(data.valueOverride ?? data.value!);
      createNotification({
        type: "info",
        title: "Secret value copied.",
        text: ""
      });
      setIsUrlCopied(true);
    } catch (error) {
      console.error(error);
      createNotification({
        type: "error",
        text: "Error fetching secret value"
      });
    }
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
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                variant="ghost"
                className="mr-2"
                size="xs"
                isDisabled={secret.secretValueHidden}
                aria-label="Copy secret value"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
              >
                {isUrlCopied ? <CheckIcon /> : <CopyIcon />}
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>
              {secret.secretValueHidden
                ? "You do not have permission to view this secret value"
                : "Copy secret value"}
            </TooltipContent>
          </Tooltip>
          <ChevronRightIcon className="size-4 text-muted" />
        </div>
      </TableCell>
    </TableRow>
  );
};
