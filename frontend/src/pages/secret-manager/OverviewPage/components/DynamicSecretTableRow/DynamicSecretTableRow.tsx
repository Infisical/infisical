import { subject } from "@casl/ability";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EditIcon,
  FileKeyIcon,
  FingerprintIcon,
  ListIcon,
  TrashIcon,
  XIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { dynamicSecretProviderRegistry } from "@app/components/dynamic-secrets";
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
import { ProjectPermissionDynamicSecretActions, ProjectPermissionSub } from "@app/context";
import { useToggle } from "@app/hooks";
import { DynamicSecretStatus, TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

import { ResourceEnvironmentStatusCell } from "../ResourceEnvironmentStatusCell";
import { useRowHoverActions } from "../rowHoverActions";

type DynamicSecretWithEnv = TDynamicSecret & { environment: string };

type Props = {
  dynamicSecretName: string;
  environments: { name: string; slug: string }[];
  isDynamicSecretInEnv: (name: string, env: string) => boolean;
  getDynamicSecretByName: (envSlug: string, name: string) => DynamicSecretWithEnv | undefined;
  getDynamicSecretStatusesByName: (
    name: string
  ) => (DynamicSecretStatus | null | undefined)[] | undefined;
  tableWidth: number;
  secretPath: string;
  onEdit: (dynamicSecret: DynamicSecretWithEnv) => void;
  onGenerateLease: (dynamicSecret: DynamicSecretWithEnv) => void;
  onViewLeases: (dynamicSecret: DynamicSecretWithEnv) => void;
  onDelete: (dynamicSecret: DynamicSecretWithEnv) => void;
  onForceDelete: (dynamicSecret: DynamicSecretWithEnv) => void;
};

export const DynamicSecretTableRow = ({
  dynamicSecretName,
  environments = [],
  isDynamicSecretInEnv,
  getDynamicSecretByName,
  getDynamicSecretStatusesByName,
  tableWidth,
  secretPath,
  onEdit,
  onGenerateLease,
  onViewLeases,
  onDelete,
  onForceDelete
}: Props) => {
  const [isExpanded, setIsExpanded] = useToggle(false);
  const { shouldRenderActions, groupClassName, rowHoverProps } = useRowHoverActions();

  const isSingleEnvView = environments.length === 1;
  const totalCols = environments.length + 2;

  const statuses = getDynamicSecretStatusesByName(dynamicSecretName);

  const singleEnvSlug = isSingleEnvView ? environments[0].slug : "";
  const singleEnvDynamicSecret = isSingleEnvView
    ? getDynamicSecretByName(singleEnvSlug, dynamicSecretName)
    : undefined;

  const renderStatusIndicator = (dynamicSecret: DynamicSecretWithEnv) => {
    if (!dynamicSecret.status) return null;
    const statusLabel = dynamicSecret.statusDetails || dynamicSecret.status;
    const visibleStatusLabel =
      dynamicSecret.status === DynamicSecretStatus.Deleting ? "Revoking" : "Deletion Failed";

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            aria-label={`Dynamic secret status: ${statusLabel}`}
            className="ml-2"
            variant={dynamicSecret.status === DynamicSecretStatus.Deleting ? "warning" : "danger"}
          >
            <AlertTriangleIcon aria-hidden="true" />
            {visibleStatusLabel}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{statusLabel}</TooltipContent>
      </Tooltip>
    );
  };

  const renderActionButtons = (dynamicSecret: DynamicSecretWithEnv) => {
    const isRevoking = dynamicSecret.status === DynamicSecretStatus.Deleting;

    return (
      <div className="flex items-center gap-1 rounded-md border border-border bg-container-hover p-0.5 shadow-md">
        <ProjectPermissionCan
          I={ProjectPermissionDynamicSecretActions.Lease}
          a={subject(ProjectPermissionSub.DynamicSecrets, {
            environment: dynamicSecret.environment,
            secretPath,
            metadata: dynamicSecret.metadata
          })}
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label="View leases"
                  variant="ghost"
                  size="xs"
                  className="border-0"
                  isDisabled={!isAllowed || isRevoking}
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewLeases(dynamicSecret);
                  }}
                >
                  <ListIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>View Leases</TooltipContent>
            </Tooltip>
          )}
        </ProjectPermissionCan>
        <ProjectPermissionCan
          I={ProjectPermissionDynamicSecretActions.Lease}
          a={subject(ProjectPermissionSub.DynamicSecrets, {
            environment: dynamicSecret.environment,
            secretPath,
            metadata: dynamicSecret.metadata
          })}
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label="Generate lease"
                  variant="ghost"
                  size="xs"
                  className="border-0"
                  isDisabled={!isAllowed || isRevoking}
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerateLease(dynamicSecret);
                  }}
                >
                  <FileKeyIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Generate Lease</TooltipContent>
            </Tooltip>
          )}
        </ProjectPermissionCan>
        <ProjectPermissionCan
          I={ProjectPermissionDynamicSecretActions.EditRootCredential}
          a={subject(ProjectPermissionSub.DynamicSecrets, {
            environment: dynamicSecret.environment,
            secretPath,
            metadata: dynamicSecret.metadata
          })}
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label="Edit dynamic secret"
                  variant="ghost"
                  size="xs"
                  className="border-0"
                  isDisabled={!isAllowed || isRevoking}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(dynamicSecret);
                  }}
                >
                  <EditIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
          )}
        </ProjectPermissionCan>
        {dynamicSecret.status === DynamicSecretStatus.FailedDeletion && (
          <ProjectPermissionCan
            I={ProjectPermissionDynamicSecretActions.DeleteRootCredential}
            a={subject(ProjectPermissionSub.DynamicSecrets, {
              environment: dynamicSecret.environment,
              secretPath,
              metadata: dynamicSecret.metadata
            })}
          >
            {(isAllowed) => (
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    aria-label="Force delete dynamic secret"
                    variant="ghost"
                    size="xs"
                    className="border-0 hover:text-danger"
                    isDisabled={!isAllowed}
                    onClick={(e) => {
                      e.stopPropagation();
                      onForceDelete(dynamicSecret);
                    }}
                  >
                    <XIcon />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>Force Delete</TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
        )}
        <ProjectPermissionCan
          I={ProjectPermissionDynamicSecretActions.DeleteRootCredential}
          a={subject(ProjectPermissionSub.DynamicSecrets, {
            environment: dynamicSecret.environment,
            secretPath,
            metadata: dynamicSecret.metadata
          })}
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label="Delete dynamic secret"
                  variant="ghost"
                  size="xs"
                  className="border-0 hover:text-danger"
                  isDisabled={!isAllowed || isRevoking}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(dynamicSecret);
                  }}
                >
                  <TrashIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          )}
        </ProjectPermissionCan>
      </div>
    );
  };

  return (
    <>
      <TableRow
        onClick={isSingleEnvView ? undefined : setIsExpanded.toggle}
        className={twMerge(groupClassName, "hover:z-10")}
        {...rowHoverProps}
      >
        <TableCell
          className={twMerge(
            !isSingleEnvView && "sticky left-0 z-10",
            "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            !isSingleEnvView && isExpanded && "border-b-0 bg-container-hover"
          )}
        >
          {!isSingleEnvView ? (
            <IconButton
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${dynamicSecretName}`}
              aria-expanded={isExpanded}
              variant="ghost-muted"
              size="2xs"
              onClick={(event) => {
                event.stopPropagation();
                setIsExpanded.toggle();
              }}
            >
              {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </IconButton>
          ) : (
            <FingerprintIcon className="text-dynamic-secret" />
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
          {isSingleEnvView && singleEnvDynamicSecret ? (
            <div className="relative flex w-full items-center pr-40">
              <span className="truncate">{dynamicSecretName}</span>
              <Badge variant="neutral" className="ml-2">
                {dynamicSecretProviderRegistry.requireDefinition(singleEnvDynamicSecret.type).label}
              </Badge>
              {renderStatusIndicator(singleEnvDynamicSecret)}
              <div className="absolute top-1/2 -right-2.5 z-20 -translate-y-1/2">
                {shouldRenderActions && renderActionButtons(singleEnvDynamicSecret)}
              </div>
            </div>
          ) : (
            <>
              {dynamicSecretName}
              {statuses?.some(
                (status) =>
                  status === DynamicSecretStatus.FailedDeletion ||
                  status === DynamicSecretStatus.Deleting
              ) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className="absolute top-1/2 right-2 -translate-y-1/2" variant="danger">
                      <XIcon />
                      {statuses?.some((status) => status === DynamicSecretStatus.FailedDeletion)
                        ? "Deletion Failed"
                        : "Revoking"}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>One or more dynamic secrets have issues.</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </TableCell>
        {environments.length > 1 &&
          environments.map(({ slug }, i) => {
            if (isExpanded)
              return (
                <TableCell
                  key={`sec-overview-${slug}-${i + 1}-dynamic-secret`}
                  className="border-b-0 bg-container-hover"
                />
              );

            const isPresent = isDynamicSecretInEnv(dynamicSecretName, slug);

            return (
              <ResourceEnvironmentStatusCell
                key={`sec-overview-${slug}-${i + 1}-dynamic-secret`}
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
                      const dynamicSecret = getDynamicSecretByName(env.slug, dynamicSecretName);
                      return Boolean(dynamicSecret);
                    })
                    .map(({ name: envName, slug }) => {
                      const dynamicSecret = getDynamicSecretByName(slug, dynamicSecretName)!;

                      return (
                        <TableRow key={slug} className="group relative hover:z-10">
                          <TableCell colSpan={2}>
                            <div className="relative flex w-full flex-wrap items-center pr-40">
                              <span>{envName}</span>
                              <Badge variant="neutral" className="ml-2">
                                {
                                  dynamicSecretProviderRegistry.requireDefinition(
                                    dynamicSecret.type
                                  ).label
                                }
                              </Badge>
                              {renderStatusIndicator(dynamicSecret)}
                              <div className="absolute top-1/2 -right-1.5 z-20 -translate-y-1/2">
                                {renderActionButtons(dynamicSecret)}
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
