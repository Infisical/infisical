import {
  faCheck,
  faChevronRight,
  faCopy,
  faEye,
  faFolder,
  faKey
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { CurlyBracesIcon, TagsIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  IconButton,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useProject } from "@app/context";
import { reverseTruncate } from "@app/helpers/reverseTruncate";
import { useTimedReset } from "@app/hooks";
import { fetchSecretValue } from "@app/hooks/api/dashboard/queries";
import { TDashboardProjectSecretsQuickSearch } from "@app/hooks/api/dashboard/types";
import { ProjectEnv } from "@app/hooks/api/projects/types";

type Props = {
  environments: ProjectEnv[];
  secretGroup: TDashboardProjectSecretsQuickSearch["secrets"][string];
  onClose: () => void;
  isSingleEnv?: boolean;
  tags: string[];
  search: string;
};

export const QuickSearchSecretItem = ({
  secretGroup,
  environments,
  onClose,
  tags,
  isSingleEnv,
  search
}: Props) => {
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/secret-management/$projectId/overview"
  });
  const envSlugMap = new Map(environments.map((env) => [env.slug, env]));
  const [isUrlCopied, , setIsUrlCopied] = useTimedReset<boolean>({
    initialState: false
  });

  const { currentProject } = useProject();

  const [groupSecret] = secretGroup;

  const handleNavigate = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        secretPath: groupSecret.path,
        search: groupSecret.key,
        tags: tags.length ? tags.join(",") : undefined
      })
    });
    onClose();
  };

  const handleCopy = async (env: string) => {
    try {
      const data = await fetchSecretValue({
        environment: groupSecret.env,
        secretPath: groupSecret.path!,
        secretKey: groupSecret.key,
        projectId: currentProject.id
      });

      navigator.clipboard.writeText(data.valueOverride ?? data.value!);
      createNotification({
        type: "info",
        title: isSingleEnv ? "Secret value copied." : `Secret value copied from ${env}.`,
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

  const secretGroupTags = secretGroup.flatMap((secret) => secret.tags);

  const tagMatch =
    search.trim() &&
    secretGroupTags?.find((tag) => tag && tag.slug.toLowerCase().includes(search.toLowerCase()));

  const secretGroupMetadata = secretGroup.flatMap((secret) => secret.secretMetadata);

  const metadataMatch =
    search.trim() &&
    secretGroupMetadata?.find(
      (metadata) =>
        metadata &&
        (metadata.key.toLowerCase().includes(search.toLowerCase()) ||
          metadata.value.toLowerCase().includes(search.toLowerCase()))
    );

  return (
    <Tr
      className="hover cursor-pointer bg-mineshaft-700 hover:bg-mineshaft-600"
      onClick={handleNavigate}
    >
      <Td className="w-full">
        <div className="inline-flex max-w-[20rem] flex-col">
          <span className="truncate">
            <FontAwesomeIcon className="mr-2 self-center text-bunker-300" icon={faKey} />
            {groupSecret.key}
          </span>
          <span className="text-xs text-mineshaft-400">
            <FontAwesomeIcon size="xs" className="mr-0.5 text-yellow-700" icon={faFolder} />{" "}
            <Tooltip className="max-w-8xl" content={groupSecret.path}>
              <span>{reverseTruncate(groupSecret.path ?? "")}</span>
            </Tooltip>
          </span>
        </div>
      </Td>
      <Td>
        <div className="flex w-full items-center justify-end gap-4">
          {tagMatch && (
            <Badge variant="neutral">
              <TagsIcon />
              {tagMatch.slug}
            </Badge>
          )}
          {metadataMatch && !tagMatch && (
            <Badge variant="neutral">
              <CurlyBracesIcon />
              Metadata
            </Badge>
          )}
          {isSingleEnv ? (
            <Tooltip
              isDisabled={!groupSecret?.secretValueHidden}
              content={
                groupSecret?.secretValueHidden
                  ? "You do not have permission to view this secret value"
                  : ""
              }
            >
              <IconButton
                size="md"
                isDisabled={groupSecret?.secretValueHidden}
                variant="plain"
                colorSchema="secondary"
                ariaLabel="Copy secret value"
                onClick={(e) => {
                  e.stopPropagation();
                  const el = envSlugMap.get(groupSecret.env)?.name;
                  if (el) {
                    handleCopy(el);
                  }
                }}
              >
                <FontAwesomeIcon icon={isUrlCopied ? faCheck : faCopy} />
              </IconButton>
            </Tooltip>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  size="md"
                  variant="plain"
                  colorSchema="secondary"
                  ariaLabel="Copy secret value"
                >
                  <FontAwesomeIcon icon={isUrlCopied ? faCheck : faCopy} />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Copy Value From...</DropdownMenuLabel>
                {secretGroup.map((secret) => (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      const el = envSlugMap.get(secret.env)?.name;
                      if (el) {
                        handleCopy(el);
                      }
                    }}
                    key={secret.id}
                  >
                    <p className="text-sm">{envSlugMap.get(secret.env)?.name}</p>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Tooltip
                isDisabled={!groupSecret?.secretValueHidden}
                content={
                  groupSecret?.secretValueHidden
                    ? "You do not have permission to view this secret value"
                    : ""
                }
              >
                <IconButton
                  size="md"
                  isDisabled={groupSecret?.secretValueHidden}
                  variant="plain"
                  colorSchema="secondary"
                  ariaLabel="View secret value"
                >
                  <FontAwesomeIcon icon={faEye} />
                </IconButton>
              </Tooltip>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Hover to Reveal...</DropdownMenuLabel>
              {secretGroup.map((secret) => (
                <DropdownMenuItem
                  className="group"
                  onClick={(e) => {
                    e.stopPropagation();
                    const el = envSlugMap.get(secret.env)?.name;
                    if (el) {
                      handleCopy(el);
                    }
                  }}
                  key={secret.id}
                >
                  <Tooltip side="left" sideOffset={18} content="Click to copy to clipboard">
                    <div>
                      {!isSingleEnv && (
                        <span className="text-xs text-mineshaft-400">
                          {envSlugMap.get(secret.env)?.name}
                        </span>
                      )}
                      <p
                        className={twMerge(
                          "hidden w-48 max-w-48 truncate text-sm group-hover:block",
                          !secret.value && "text-mineshaft-400"
                        )}
                      >
                        {secret.value || "EMPTY"}
                      </p>
                      <p className="w-48 text-sm group-hover:!hidden">
                        ***************************
                      </p>
                    </div>
                  </Tooltip>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Td>
      <Td>
        <FontAwesomeIcon icon={faChevronRight} />
      </Td>
    </Tr>
  );
};
