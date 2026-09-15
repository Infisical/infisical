import { subject } from "@casl/ability";
import {
  BanIcon,
  ChevronDownIcon,
  ClipboardCheckIcon,
  CopyIcon,
  EditIcon,
  EllipsisIcon,
  HexagonIcon,
  InfoIcon,
  ListIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { HONEY_TOKEN_MAP } from "@app/helpers/honeyTokens";
import { useTimedReset, useToggle } from "@app/hooks";
import { HoneyTokenStatus, HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";
import { TDashboardHoneyToken } from "@app/hooks/api/honeyTokens/types";

import { ResourceEnvironmentStatusCell } from "../ResourceEnvironmentStatusCell";
import { useRowHoverActions } from "../rowHoverActions";

const STATUS_BADGE_VARIANT: Record<string, "success" | "danger" | "neutral"> = {
  [HoneyTokenStatus.Active]: "success",
  [HoneyTokenStatus.Triggered]: "danger",
  [HoneyTokenStatus.Revoked]: "neutral"
};

const ACTION_BUTTON_CLASS_NAME =
  "overflow-hidden border-0 transition-all duration-300 motion-reduce:transition-none [@media(hover:hover)]:w-0 [@media(hover:hover)]:group-hover:w-7 [@media(hover:hover)]:group-focus-within:w-7";

type Props = {
  honeyTokenName: string;
  environments: { name: string; slug: string }[];
  isHoneyTokenInEnv: (name: string, env: string) => boolean;
  getHoneyTokenByName: (slug: string, name: string) => TDashboardHoneyToken | undefined;
  tableWidth: number;
  onEdit: (honeyToken: TDashboardHoneyToken) => void;
  onRevoke: (honeyToken: TDashboardHoneyToken) => void;
  onViewDetails: (honeyToken: TDashboardHoneyToken) => void;
};

export const HoneyTokenTableRow = ({
  honeyTokenName,
  environments = [],
  isHoneyTokenInEnv,
  getHoneyTokenByName,
  tableWidth,
  onEdit,
  onRevoke,
  onViewDetails
}: Props) => {
  const [isExpanded, setIsExpanded] = useToggle(false);
  const [, isNameCopied, setIsNameCopied] = useTimedReset({ initialState: false });

  const isSingleEnvView = environments.length === 1;
  // The action bar only exists in the single-environment view, where the row itself holds
  // nothing focusable. The multi-environment row has no bar to reach.
  const { shouldRenderActions, groupClassName, rowHoverProps } = useRowHoverActions({
    needsRowTabStop: isSingleEnvView
  });

  const totalCols = environments.length + 2;

  const singleEnvSlug = isSingleEnvView ? environments[0].slug : "";
  const singleEnvToken = isSingleEnvView
    ? getHoneyTokenByName(singleEnvSlug, honeyTokenName)
    : undefined;

  const isTriggered = environments.some((env) => {
    const ht = getHoneyTokenByName(env.slug, honeyTokenName);
    return ht?.status === HoneyTokenStatus.Triggered;
  });

  const isAllRevoked = environments.every((env) => {
    const ht = getHoneyTokenByName(env.slug, honeyTokenName);
    return !ht || ht.status === HoneyTokenStatus.Revoked;
  });

  const renderActionButtons = (honeyToken: TDashboardHoneyToken) => {
    const isRevoked = honeyToken.status === HoneyTokenStatus.Revoked;

    return (
      <div
        className={twMerge(
          "pointer-events-auto flex items-center gap-1 rounded-md border border-border bg-container-hover p-0.5 opacity-100 transition-all duration-300 motion-reduce:transition-none",
          "[@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:gap-0 [@media(hover:hover)]:opacity-0",
          "[@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:gap-1 [@media(hover:hover)]:group-hover:opacity-100",
          "[@media(hover:hover)]:group-focus-within:pointer-events-auto [@media(hover:hover)]:group-focus-within:gap-1 [@media(hover:hover)]:group-focus-within:opacity-100"
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              variant="ghost"
              size="xs"
              className={ACTION_BUTTON_CLASS_NAME}
              aria-label={`View details for ${honeyToken.name}`}
              onClick={() => onViewDetails(honeyToken)}
            >
              <ListIcon />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>View details</TooltipContent>
        </Tooltip>
        {isRevoked ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                variant="ghost"
                size="xs"
                className={twMerge(
                  ACTION_BUTTON_CLASS_NAME,
                  "cursor-not-allowed opacity-50 hover:bg-transparent"
                )}
                aria-label={`More actions unavailable for ${honeyToken.name}`}
                aria-disabled
              >
                <EllipsisIcon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>Revoked honey tokens cannot be edited.</TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                variant="ghost"
                size="xs"
                className={ACTION_BUTTON_CLASS_NAME}
                aria-label={`More actions for ${honeyToken.name}`}
              >
                <EllipsisIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <ProjectPermissionCan
                I={ProjectPermissionHoneyTokenActions.Edit}
                a={subject(ProjectPermissionSub.HoneyTokens, {
                  environment: honeyToken.environment.slug,
                  secretPath: honeyToken.folder.path
                })}
              >
                {(isAllowed) => (
                  <DropdownMenuItem isDisabled={!isAllowed} onSelect={() => onEdit(honeyToken)}>
                    <EditIcon />
                    Edit
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionHoneyTokenActions.Revoke}
                a={subject(ProjectPermissionSub.HoneyTokens, {
                  environment: honeyToken.environment.slug,
                  secretPath: honeyToken.folder.path
                })}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    variant="danger"
                    isDisabled={!isAllowed}
                    onSelect={() => onRevoke(honeyToken)}
                  >
                    <BanIcon />
                    Revoke
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  const renderHoneyTokenInlineDetails = (honeyToken: TDashboardHoneyToken) => {
    const tokenInfo = HONEY_TOKEN_MAP[honeyToken.type as HoneyTokenType];
    const mappedKeys = Object.values(honeyToken.secretsMapping || {});

    return (
      <>
        {tokenInfo && (
          <Badge
            variant="neutral"
            className="mx-2.5 bg-[color-mix(in_srgb,var(--color-neutral)_15%,var(--color-container))]"
          >
            <img
              src={`/images/integrations/${tokenInfo.image}`}
              style={{ width: "11px" }}
              alt={`${tokenInfo.name} logo`}
            />
            {tokenInfo.name} Honey Token
          </Badge>
        )}
        {mappedKeys.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="mr-2.5 !size-3 text-accent" />
            </TooltipTrigger>
            <TooltipContent>Mapped secrets: {mappedKeys.join(", ")}</TooltipContent>
          </Tooltip>
        )}
      </>
    );
  };

  const renderStatusBadge = (honeyToken: TDashboardHoneyToken) => (
    <Badge variant={STATUS_BADGE_VARIANT[honeyToken.status] ?? "neutral"}>
      {honeyToken.status === HoneyTokenStatus.Active && "Active"}
      {honeyToken.status === HoneyTokenStatus.Triggered && "Triggered"}
      {honeyToken.status === HoneyTokenStatus.Revoked && "Revoked"}
    </Badge>
  );

  return (
    <>
      <TableRow
        onClick={isSingleEnvView ? undefined : setIsExpanded.toggle}
        className={twMerge(
          groupClassName,
          "hover:z-10",
          isTriggered && !isExpanded && "bg-danger/5 hover:bg-danger/10"
        )}
        {...rowHoverProps}
      >
        <TableCell
          className={twMerge(
            !isSingleEnvView && "sticky left-0 z-10",
            "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            isTriggered && !isExpanded && "bg-danger/5 group-hover:bg-danger/10",
            !isSingleEnvView && isExpanded && "border-b-0 bg-container-hover"
          )}
        >
          {!isSingleEnvView && isExpanded ? (
            <ChevronDownIcon className="block" />
          ) : (
            <HexagonIcon
              className={twMerge(
                isTriggered && "text-danger",
                !isTriggered && !isAllRevoked && "text-warning",
                isAllRevoked && "text-muted"
              )}
            />
          )}
        </TableCell>
        <TableCell
          className={twMerge(
            !isSingleEnvView && "sticky left-10 z-10 border-r",
            "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            isTriggered && !isExpanded && "bg-danger/5 group-hover:bg-danger/10",
            !isSingleEnvView && isExpanded && "border-r-0 border-b-0 bg-container-hover"
          )}
          isTruncatable
          colSpan={isSingleEnvView ? 2 : undefined}
        >
          {isSingleEnvView && singleEnvToken ? (
            <div className="relative flex w-full items-center">
              <span
                className={twMerge(
                  "truncate",
                  singleEnvToken.status === HoneyTokenStatus.Revoked && "text-muted"
                )}
              >
                {honeyTokenName}
              </span>
              {renderHoneyTokenInlineDetails(singleEnvToken)}
              <div
                className={twMerge(
                  "ml-auto flex items-center transition-[margin] duration-300 motion-reduce:transition-none [@media(hover:hover)]:mr-0",
                  "mr-16 [@media(hover:hover)]:group-focus-within:mr-16 [@media(hover:hover)]:group-hover:mr-16"
                )}
              >
                {renderStatusBadge(singleEnvToken)}
              </div>
              <div className="absolute top-1/2 -right-2.5 z-20 -translate-y-1/2">
                {shouldRenderActions && renderActionButtons(singleEnvToken)}
              </div>
            </div>
          ) : (
            <span className={twMerge(isAllRevoked && "text-muted")}>{honeyTokenName}</span>
          )}
          {!isSingleEnvView && (
            <div
              className={twMerge(
                "absolute top-1/2 right-[3px] z-20 -translate-y-1/2",
                "flex items-center rounded-md border border-border bg-container-hover p-0.5 shadow-md",
                "pointer-events-auto opacity-100 transition-all duration-300 motion-reduce:transition-none",
                "[@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0",
                "[@media(hover:hover)]:group-focus-within:pointer-events-auto [@media(hover:hover)]:group-focus-within:opacity-100",
                "[@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100"
              )}
            >
              <Tooltip disableHoverableContent>
                <TooltipTrigger asChild>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    aria-label={`Copy honey token name ${honeyTokenName}`}
                    className={ACTION_BUTTON_CLASS_NAME}
                    onClick={(event) => {
                      event.stopPropagation();
                      navigator.clipboard.writeText(honeyTokenName);
                      setIsNameCopied(true);
                    }}
                  >
                    {isNameCopied ? <ClipboardCheckIcon /> : <CopyIcon />}
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>Copy Honey Token Name</TooltipContent>
              </Tooltip>
            </div>
          )}
        </TableCell>
        {environments.length > 1 &&
          environments.map(({ slug }, i) => {
            if (isExpanded)
              return (
                <TableCell
                  key={`ht-overview-${slug}-${i + 1}`}
                  className="border-b-0 bg-container-hover"
                />
              );

            const isPresent = isHoneyTokenInEnv(honeyTokenName, slug);

            return (
              <ResourceEnvironmentStatusCell
                key={`ht-overview-${slug}-${i + 1}`}
                status={isPresent ? "present" : "missing"}
              />
            );
          })}
      </TableRow>
      {!isSingleEnvView && isExpanded && (
        <TableRow>
          <TableCell colSpan={totalCols} className={`${isExpanded && "bg-card p-0"}`}>
            <div
              style={{ minWidth: tableWidth, maxWidth: tableWidth }}
              className="sticky left-0 flex flex-col gap-y-4 border-t-2 border-b-1 border-l-1 border-border border-x-project/50 bg-card p-4"
            >
              <Table containerClassName="border-none rounded-none bg-transparent">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-full">Environment</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {environments
                    .filter((env) => {
                      const honeyToken = getHoneyTokenByName(env.slug, honeyTokenName);
                      return Boolean(honeyToken);
                    })
                    .map(({ name: envName, slug }) => {
                      const honeyToken = getHoneyTokenByName(slug, honeyTokenName)!;

                      return (
                        <TableRow
                          key={slug}
                          className={twMerge(
                            "group relative hover:z-10",
                            honeyToken.status === HoneyTokenStatus.Triggered &&
                              "bg-danger/5 hover:bg-danger/10"
                          )}
                        >
                          <TableCell colSpan={2}>
                            <div className="relative flex w-full items-center">
                              <span
                                className={twMerge(
                                  honeyToken.status === HoneyTokenStatus.Revoked && "text-muted"
                                )}
                              >
                                {envName}
                              </span>
                              {renderHoneyTokenInlineDetails(honeyToken)}
                              <div
                                className={twMerge(
                                  "ml-auto flex items-center transition-[margin] duration-300 motion-reduce:transition-none [@media(hover:hover)]:mr-0",
                                  "mr-16 [@media(hover:hover)]:group-focus-within:mr-16 [@media(hover:hover)]:group-hover:mr-16"
                                )}
                              >
                                {renderStatusBadge(honeyToken)}
                              </div>
                              <div className="absolute top-1/2 -right-1.5 z-20 -translate-y-1/2">
                                {renderActionButtons(honeyToken)}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};
