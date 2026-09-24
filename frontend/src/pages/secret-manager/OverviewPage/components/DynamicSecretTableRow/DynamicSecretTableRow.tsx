import { subject } from "@casl/ability";
import {
  AlertTriangleIcon,
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
import {
  Badge,
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
import { useProjectPermission } from "@app/context/ProjectPermissionContext";
import { useToggle } from "@app/hooks";
import { DynamicSecretStatus, TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

import { ResourceEnvironmentStatusCell } from "../ResourceEnvironmentStatusCell";
import { RowAction, RowActionMenu } from "../RowActionMenu";
import {
  TABLE_ROW_EXPAND_ICON_CLASS_NAME,
  TABLE_ROW_EXPANDED_ICON_CLASS_NAME,
  TABLE_ROW_NAME_CELL_COLUMN_CLASS_NAME,
  TABLE_ROW_NAME_HEADER_COLUMN_CLASS_NAME,
  TABLE_ROW_RESOURCE_ICON_CLASS_NAME
} from "../tableRowActionStyles";

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
  const { permission } = useProjectPermission();

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

  const getActions = (dynamicSecret: DynamicSecretWithEnv): RowAction[] => {
    const isRevoking = dynamicSecret.status === DynamicSecretStatus.Deleting;
    const resource = subject(ProjectPermissionSub.DynamicSecrets, {
      environment: dynamicSecret.environment,
      secretPath,
      metadata: dynamicSecret.metadata
    });
    const canLease = permission.can(ProjectPermissionDynamicSecretActions.Lease, resource);
    const canEdit = permission.can(
      ProjectPermissionDynamicSecretActions.EditRootCredential,
      resource
    );
    const canDelete = permission.can(
      ProjectPermissionDynamicSecretActions.DeleteRootCredential,
      resource
    );

    return [
      {
        label: "View Leases",
        icon: <ListIcon />,
        onSelect: () => onViewLeases(dynamicSecret),
        disabled: !canLease || isRevoking
      },
      {
        label: "Generate Lease",
        icon: <FileKeyIcon />,
        onSelect: () => onGenerateLease(dynamicSecret),
        disabled: !canLease || isRevoking
      },
      {
        label: "Edit",
        icon: <EditIcon />,
        onSelect: () => onEdit(dynamicSecret),
        disabled: !canEdit || isRevoking
      },
      ...(dynamicSecret.status === DynamicSecretStatus.FailedDeletion
        ? [
            {
              label: "Force Delete",
              icon: <XIcon />,
              onSelect: () => onForceDelete(dynamicSecret),
              disabled: !canDelete,
              danger: true
            }
          ]
        : []),
      {
        label: "Delete",
        icon: <TrashIcon />,
        onSelect: () => onDelete(dynamicSecret),
        disabled: !canDelete || isRevoking,
        danger: true
      }
    ];
  };

  return (
    <>
      <TableRow
        onClick={isSingleEnvView ? undefined : setIsExpanded.toggle}
        className="group hover:z-10"
      >
        <TableCell
          className={twMerge(
            "w-10 max-w-10 min-w-10 p-0",
            !isSingleEnvView && "sticky left-0 z-10",
            "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            !isSingleEnvView && isExpanded && "border-b-0 bg-container-hover"
          )}
        >
          <div className="flex h-full items-center justify-center [&>svg]:size-4">
            <FingerprintIcon
              className={twMerge(
                "text-dynamic-secret",
                !isSingleEnvView && !isExpanded && TABLE_ROW_RESOURCE_ICON_CLASS_NAME,
                !isSingleEnvView && isExpanded && "hidden"
              )}
            />
            {!isSingleEnvView && (
              <ChevronRightIcon
                className={
                  isExpanded ? TABLE_ROW_EXPANDED_ICON_CLASS_NAME : TABLE_ROW_EXPAND_ICON_CLASS_NAME
                }
              />
            )}
          </div>
        </TableCell>
        <TableCell
          className={twMerge(
            "sticky left-10 z-10",
            !isSingleEnvView && "border-r",
            "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            !isSingleEnvView && isExpanded && "border-r-0 border-b-0 bg-container-hover"
          )}
          isTruncatable
          colSpan={isSingleEnvView ? 2 : undefined}
        >
          {isSingleEnvView && singleEnvDynamicSecret ? (
            <div className="flex w-full items-center">
              <span className="min-w-0 truncate">{dynamicSecretName}</span>
              <Badge variant="neutral" className="ml-2 shrink-0">
                {dynamicSecretProviderRegistry.requireDefinition(singleEnvDynamicSecret.type).label}
              </Badge>
              {renderStatusIndicator(singleEnvDynamicSecret)}
              <div className="ml-auto shrink-0">
                <RowActionMenu
                  label={`${dynamicSecretName} in ${environments[0].name}`}
                  actions={getActions(singleEnvDynamicSecret)}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center">
              <span className="min-w-0 truncate">{dynamicSecretName}</span>
              {statuses?.some(
                (status) =>
                  status === DynamicSecretStatus.FailedDeletion ||
                  status === DynamicSecretStatus.Deleting
              ) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className="ml-auto shrink-0" variant="danger">
                      <XIcon />
                      {statuses?.some((status) => status === DynamicSecretStatus.FailedDeletion)
                        ? "Deletion Failed"
                        : "Revoking"}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>One or more dynamic secrets have issues.</TooltipContent>
                </Tooltip>
              )}
              <div className="ml-auto shrink-0">
                <RowActionMenu
                  label={dynamicSecretName}
                  actions={[
                    {
                      label: isExpanded ? "Collapse Environments" : "Expand Environments",
                      onSelect: setIsExpanded.toggle
                    }
                  ]}
                />
              </div>
            </div>
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
        <TableRow className="border-0 hover:bg-transparent">
          <TableCell colSpan={totalCols} className="border-0 p-0">
            <div
              style={{ minWidth: tableWidth, maxWidth: tableWidth }}
              className="sticky left-0 border-y border-border"
            >
              <Table containerClassName="rounded-none border-0">
                <TableHeader className="bg-container-hover">
                  <TableRow>
                    <TableHead aria-hidden="true" className="w-10 max-w-10 min-w-10 p-0" />
                    <TableHead className={TABLE_ROW_NAME_HEADER_COLUMN_CLASS_NAME}>
                      Environment
                    </TableHead>
                    <TableHead className="w-full" />
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
                          <TableCell aria-hidden="true" className="w-10 max-w-10 min-w-10 p-0" />
                          <TableCell
                            className={twMerge(
                              TABLE_ROW_NAME_CELL_COLUMN_CLASS_NAME,
                              "sticky left-10 z-10 bg-container"
                            )}
                          >
                            <div className="flex items-center">
                              <span className="min-w-0 truncate">{envName}</span>
                              <div className="ml-auto shrink-0">
                                <RowActionMenu
                                  label={`${dynamicSecretName} in ${envName}`}
                                  actions={getActions(dynamicSecret)}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex w-full flex-wrap items-center">
                              <Badge variant="neutral">
                                {
                                  dynamicSecretProviderRegistry.requireDefinition(
                                    dynamicSecret.type
                                  ).label
                                }
                              </Badge>
                              {renderStatusIndicator(dynamicSecret)}
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
