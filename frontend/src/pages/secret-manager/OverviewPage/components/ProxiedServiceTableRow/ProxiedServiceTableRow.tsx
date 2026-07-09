import { subject } from "@casl/ability";
import { ArrowRightLeftIcon, ChevronDownIcon, EditIcon, Trash2Icon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
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
  ProjectPermissionProxiedServiceActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useToggle } from "@app/hooks";
import { TDashboardProxiedService } from "@app/hooks/api/proxiedServices/types";

import { ResourceEnvironmentStatusCell } from "../ResourceEnvironmentStatusCell";

type Props = {
  proxiedServiceName: string;
  environments: { name: string; slug: string }[];
  isProxiedServiceInEnv: (name: string, env: string) => boolean;
  getProxiedServiceByName: (slug: string, name: string) => TDashboardProxiedService | undefined;
  tableWidth: number;
  onEdit: (proxiedService: TDashboardProxiedService) => void;
  onDelete: (proxiedService: TDashboardProxiedService) => void;
};

export const ProxiedServiceTableRow = ({
  proxiedServiceName,
  environments = [],
  isProxiedServiceInEnv,
  getProxiedServiceByName,
  tableWidth,
  onEdit,
  onDelete
}: Props) => {
  const [isExpanded, setIsExpanded] = useToggle(false);

  const isSingleEnvView = environments.length === 1;
  const totalCols = environments.length + 2;

  const singleEnvSlug = isSingleEnvView ? environments[0].slug : "";
  const singleEnvService = isSingleEnvView
    ? getProxiedServiceByName(singleEnvSlug, proxiedServiceName)
    : undefined;

  const renderActionButtons = (proxiedService: TDashboardProxiedService) => (
    <div
      className={twMerge(
        "flex items-center rounded-md border border-border bg-container-hover px-0.5 py-0.5 shadow-md",
        "pointer-events-none opacity-0 transition-all duration-300",
        "group-hover:pointer-events-auto group-hover:gap-1 group-hover:opacity-100"
      )}
    >
      <ProjectPermissionCan
        I={ProjectPermissionProxiedServiceActions.Edit}
        a={subject(ProjectPermissionSub.ProxiedServices, {
          environment: proxiedService.environment.slug,
          secretPath: proxiedService.folder.path
        })}
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
                isDisabled={!isAllowed}
                onClick={() => onEdit(proxiedService)}
              >
                <EditIcon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
        )}
      </ProjectPermissionCan>
      <ProjectPermissionCan
        I={ProjectPermissionProxiedServiceActions.Delete}
        a={subject(ProjectPermissionSub.ProxiedServices, {
          environment: proxiedService.environment.slug,
          secretPath: proxiedService.folder.path
        })}
        renderTooltip
        allowedLabel="Delete"
      >
        {(isAllowed) => (
          <Tooltip>
            <TooltipTrigger>
              <IconButton
                variant="ghost"
                size="xs"
                className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7 hover:text-danger"
                isDisabled={!isAllowed}
                onClick={() => onDelete(proxiedService)}
              >
                <Trash2Icon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        )}
      </ProjectPermissionCan>
    </div>
  );

  const renderInlineDetails = (proxiedService: TDashboardProxiedService) => (
    <div
      className={twMerge(
        "ml-auto flex items-center gap-x-2 transition-[margin] duration-300",
        "group-hover:mr-24"
      )}
    >
      <Badge variant="neutral" className="max-w-[240px] overflow-hidden">
        <span className="block max-w-[240px] truncate" title={proxiedService.hostPattern}>
          {proxiedService.hostPattern}
        </span>
      </Badge>
      {!proxiedService.isEnabled && <Badge variant="neutral">Disabled</Badge>}
    </div>
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
          {!isSingleEnvView && isExpanded ? (
            <ChevronDownIcon className="block" />
          ) : (
            <ArrowRightLeftIcon className="text-proxied-service" />
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
          {isSingleEnvView && singleEnvService ? (
            <div className="relative flex w-full items-center">
              <span className="truncate">{proxiedServiceName}</span>
              {renderInlineDetails(singleEnvService)}
              <div className="absolute top-1/2 -right-2.5 z-20 -translate-y-1/2">
                {renderActionButtons(singleEnvService)}
              </div>
            </div>
          ) : (
            proxiedServiceName
          )}
        </TableCell>
        {environments.length > 1 &&
          environments.map(({ slug }, i) => {
            if (isExpanded)
              return (
                <TableCell
                  key={`ps-overview-${slug}-${i + 1}`}
                  className="border-b-0 bg-container-hover"
                />
              );

            const isPresent = isProxiedServiceInEnv(proxiedServiceName, slug);

            return (
              <ResourceEnvironmentStatusCell
                key={`ps-overview-${slug}-${i + 1}`}
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
                    .filter((env) => Boolean(getProxiedServiceByName(env.slug, proxiedServiceName)))
                    .map(({ name: envName, slug }) => {
                      const proxiedService = getProxiedServiceByName(slug, proxiedServiceName)!;

                      return (
                        <TableRow key={slug} className="group relative hover:z-10">
                          <TableCell colSpan={2}>
                            <div className="relative flex w-full items-center">
                              <span>{envName}</span>
                              {renderInlineDetails(proxiedService)}
                              <div className="absolute top-1/2 -right-1.5 z-20 -translate-y-1/2">
                                {renderActionButtons(proxiedService)}
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
