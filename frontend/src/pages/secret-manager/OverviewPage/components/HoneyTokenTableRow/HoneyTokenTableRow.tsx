import {
  AsteriskIcon,
  BanIcon,
  ChevronDownIcon,
  EditIcon,
  ExternalLinkIcon,
  HexagonIcon,
  InfoIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Checkbox,
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
import { useToggle } from "@app/hooks";
import { HoneyTokenStatus, HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";
import { TDashboardHoneyToken } from "@app/hooks/api/honeyTokens/types";

import { ResourceEnvironmentStatusCell } from "../ResourceEnvironmentStatusCell";

const STATUS_BADGE_VARIANT: Record<string, "success" | "danger" | "neutral"> = {
  [HoneyTokenStatus.Active]: "success",
  [HoneyTokenStatus.Triggered]: "danger",
  [HoneyTokenStatus.Revoked]: "neutral"
};

type Props = {
  honeyTokenName: string;
  environments: { name: string; slug: string }[];
  isHoneyTokenInEnv: (name: string, env: string) => boolean;
  getHoneyTokenByName: (slug: string, name: string) => TDashboardHoneyToken | undefined;
  tableWidth: number;
  onEdit: (honeyToken: TDashboardHoneyToken) => void;
  onRevoke: (honeyToken: TDashboardHoneyToken) => void;
  onViewCredentials: (honeyToken: TDashboardHoneyToken) => void;
  onViewDetails: (honeyToken: TDashboardHoneyToken) => void;
  isSelected: boolean;
  onToggleHoneyTokenSelect: (honeyTokenName: string) => void;
};

export const HoneyTokenTableRow = ({
  honeyTokenName,
  environments = [],
  isHoneyTokenInEnv,
  getHoneyTokenByName,
  tableWidth,
  onEdit,
  onRevoke,
  onViewCredentials,
  onViewDetails,
  isSelected,
  onToggleHoneyTokenSelect
}: Props) => {
  const [isExpanded, setIsExpanded] = useToggle(false);

  const isSingleEnvView = environments.length === 1;
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
          "flex items-center rounded-md border border-border bg-container-hover px-0.5 py-0.5 shadow-md",
          "pointer-events-none opacity-0 transition-all duration-300",
          "group-hover:pointer-events-auto group-hover:gap-1 group-hover:opacity-100"
        )}
      >
        <Tooltip>
          <TooltipTrigger>
            <IconButton
              variant="ghost"
              size="xs"
              className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7"
              onClick={() => onViewDetails(honeyToken)}
            >
              <ExternalLinkIcon />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>View details</TooltipContent>
        </Tooltip>
        <ProjectPermissionCan
          I={ProjectPermissionHoneyTokenActions.ReadCredentials}
          a={ProjectPermissionSub.HoneyTokens}
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger>
                <IconButton
                  variant="ghost"
                  size="xs"
                  className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7"
                  isDisabled={!isAllowed || isRevoked}
                  onClick={() => onViewCredentials(honeyToken)}
                >
                  <AsteriskIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>View credentials</TooltipContent>
            </Tooltip>
          )}
        </ProjectPermissionCan>
        <ProjectPermissionCan
          I={ProjectPermissionHoneyTokenActions.Edit}
          a={ProjectPermissionSub.HoneyTokens}
          renderTooltip
          allowedLabel="Edit"
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger>
                <IconButton
                  variant="ghost"
                  size="xs"
                  className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7"
                  isDisabled={!isAllowed || isRevoked}
                  onClick={() => onEdit(honeyToken)}
                >
                  <EditIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
          )}
        </ProjectPermissionCan>
        {honeyToken.status !== HoneyTokenStatus.Revoked && (
          <ProjectPermissionCan
            I={ProjectPermissionHoneyTokenActions.Revoke}
            a={ProjectPermissionSub.HoneyTokens}
          >
            {(isAllowed) => (
              <Tooltip>
                <TooltipTrigger>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7 hover:text-danger"
                    onClick={() => onRevoke(honeyToken)}
                    isDisabled={!isAllowed}
                  >
                    <BanIcon />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>Revoke</TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
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
          <Badge variant="neutral" className="mx-2.5">
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
        className="group hover:z-10"
      >
        <TableCell
          className={twMerge(
            !isSingleEnvView && "sticky left-0 z-10",
            "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            !isSingleEnvView && isExpanded && "border-b-0 bg-container-hover"
          )}
        >
          <Checkbox
            variant="project"
            id={`checkbox-${honeyTokenName}`}
            isChecked={isSelected}
            onCheckedChange={() => {
              onToggleHoneyTokenSelect(honeyTokenName);
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            className={twMerge("hidden group-hover:flex", isSelected && "flex")}
          />
          {!isSingleEnvView && isExpanded ? (
            <ChevronDownIcon
              className={twMerge("block", "group-hover:!hidden", isSelected && "!hidden")}
            />
          ) : (
            <HexagonIcon
              className={twMerge(
                "group-hover:!hidden",
                isSelected && "!hidden",
                isTriggered && "text-red",
                !isTriggered && !isAllRevoked && "text-yellow",
                isAllRevoked && "text-mineshaft-400"
              )}
            />
          )}
        </TableCell>
        <TableCell
          className={twMerge(
            !isSingleEnvView && "sticky left-10 z-10 border-r",
            "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            !isSingleEnvView && isExpanded && "border-r-0 border-b-0 bg-container-hover"
          )}
          isTruncatable
          colSpan={isSingleEnvView ? 2 : undefined}
        >
          {isSingleEnvView && singleEnvToken ? (
            <div className="relative flex w-full items-center">
              <span className="truncate">{honeyTokenName}</span>
              {renderHoneyTokenInlineDetails(singleEnvToken)}
              <div
                className={twMerge(
                  "ml-auto flex items-center transition-[margin] duration-300",
                  "group-hover:mr-32"
                )}
              >
                {renderStatusBadge(singleEnvToken)}
              </div>
              <div className="absolute top-1/2 -right-2.5 z-20 -translate-y-1/2">
                {renderActionButtons(singleEnvToken)}
              </div>
            </div>
          ) : (
            honeyTokenName
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
                        <TableRow key={slug} className="group relative hover:z-10">
                          <TableCell colSpan={2}>
                            <div className="relative flex w-full items-center">
                              <span>{envName}</span>
                              {renderHoneyTokenInlineDetails(honeyToken)}
                              <div
                                className={twMerge(
                                  "ml-auto flex items-center transition-[margin] duration-300",
                                  "group-hover:mr-32"
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
