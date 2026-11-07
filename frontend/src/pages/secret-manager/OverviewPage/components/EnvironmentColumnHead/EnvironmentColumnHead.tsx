import type { ElementType, ReactNode } from "react";
import { AxiosError } from "axios";
import {
  ArrowUpDownIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  GitCommitIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  TableHead,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { downloadSecretEnvFile } from "@app/helpers/download";
import { DashboardSecretsOrderBy } from "@app/hooks/api/dashboard/types";
import { fetchProjectSecrets } from "@app/hooks/api/secrets/queries";
import { ApiErrorTypes, TApiErrors } from "@app/hooks/api/types";

import { getSecretSortValue, SECRET_SORT_OPTIONS } from "../../OverviewPage.utils";

type Props = {
  name: string;
  slug: string;
  projectId: string;
  secretPath: string;
  isSortedEnvironment: boolean;
  sortLabel?: string;
  ActiveSortIcon: ElementType<{ className?: string }>;
  sortValue: string;
  onSortChange: (value: string, envSlug: string) => void;
  onViewCommitHistory: (envSlug: string) => void;
  onDeleteEnvironment: () => void;
  resizeHandle?: ReactNode;
};

export const EnvironmentColumnHead = ({
  name,
  slug,
  projectId,
  secretPath,
  isSortedEnvironment,
  sortLabel,
  ActiveSortIcon,
  sortValue,
  onSortChange,
  onViewCommitHistory,
  onDeleteEnvironment,
  resizeHandle
}: Props) => (
  <TableHead className="relative min-w-[240px] border-r p-0 text-left whitespace-nowrap last:border-r-0">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={name}
          aria-label={`Open ${name} environment menu${
            isSortedEnvironment ? `. Currently sorting by ${sortLabel ?? "recency"}` : ""
          }`}
          className="flex h-full w-full min-w-[240px] cursor-pointer items-center justify-between gap-x-2 px-3 text-sm font-medium text-muted hover:bg-foreground/5 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className={twMerge("min-w-0 truncate", isSortedEnvironment && "text-foreground")}>
            {name}
          </span>
          {isSortedEnvironment ? (
            <ActiveSortIcon className="size-3.5 shrink-0 text-foreground" />
          ) : (
            <ChevronDownIcon className="size-3.5 shrink-0" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(event) => event.preventDefault()}>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowUpDownIcon />
            Sort Secrets by Recency
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>Use {name} Timestamps</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={isSortedEnvironment ? sortValue : ""}
              onValueChange={(value) => onSortChange(value, slug)}
            >
              {SECRET_SORT_OPTIONS.filter(
                ({ orderBy: sortField }) => sortField !== DashboardSecretsOrderBy.Name
              ).map((option) => (
                <DropdownMenuRadioItem
                  key={getSecretSortValue(option.orderBy, option.orderDirection)}
                  value={getSecretSortValue(option.orderBy, option.orderDirection)}
                >
                  <option.Icon />
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            navigator.clipboard.writeText(slug);
            createNotification({
              type: "info",
              text: "Environment slug copied to clipboard"
            });
          }}
        >
          <CopyIcon />
          Copy Environment Slug
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            try {
              const { secrets: envSecrets, imports: importedSecrets } = await fetchProjectSecrets({
                projectId,
                expandSecretReferences: true,
                includeImports: true,
                environment: slug,
                secretPath
              });
              downloadSecretEnvFile(slug, envSecrets, importedSecrets);
            } catch (err) {
              if (err instanceof AxiosError) {
                const error = err?.response?.data as TApiErrors;
                if (
                  error?.error === ApiErrorTypes.ForbiddenError &&
                  error.message.includes("readValue")
                ) {
                  createNotification({
                    title: "You don't have permission to download secrets",
                    text: "You don't have permission to view one or more of the secrets in the current folder. Please contact your administrator.",
                    type: "error"
                  });
                  return;
                }
              }
              createNotification({
                title: "Failed to download secrets",
                text: "Please try again later.",
                type: "error"
              });
            }
          }}
        >
          <DownloadIcon />
          Download as .env
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onViewCommitHistory(slug)}>
          <GitCommitIcon />
          View Commit History
        </DropdownMenuItem>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Delete}
          a={ProjectPermissionSub.Environments}
        >
          {(isAllowed) => (
            <Tooltip open={!isAllowed ? undefined : false}>
              <TooltipTrigger className="block w-full">
                <DropdownMenuItem
                  variant="danger"
                  isDisabled={!isAllowed}
                  onClick={onDeleteEnvironment}
                >
                  <TrashIcon />
                  Delete Environment
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent side="left">Access Restricted</TooltipContent>
            </Tooltip>
          )}
        </ProjectPermissionCan>
      </DropdownMenuContent>
    </DropdownMenu>
    {resizeHandle}
  </TableHead>
);
