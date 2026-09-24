import { useEffect, useState } from "react";
import { subject } from "@casl/ability";
import {
  ActivityIcon,
  ChevronDownIcon,
  EditIcon,
  EyeIcon,
  HandshakeIcon,
  InfoIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  TrashIcon,
  XIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { SecretRotationV2StatusBadge } from "@app/components/secret-rotations-v2/SecretRotationV2StatusBadge";
import {
  Badge,
  Checkbox,
  ProviderIcon,
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
import { useProjectPermission } from "@app/context/ProjectPermissionContext";
import {
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { useToggle } from "@app/hooks";
import {
  SecretRotation,
  SecretRotationStatus,
  TSecretRotationV2
} from "@app/hooks/api/secretRotationsV2";
import { HpIloRotationMethod } from "@app/hooks/api/secretRotationsV2/types/hp-ilo-rotation";
import { UnixLinuxLocalAccountRotationMethod } from "@app/hooks/api/secretRotationsV2/types/unix-linux-local-account-rotation";
import { WindowsLocalAccountRotationMethod } from "@app/hooks/api/secretRotationsV2/types/windows-local-account-rotation";

import { ResourceEnvironmentStatusCell } from "../ResourceEnvironmentStatusCell";
import { RowAction, RowActionMenu } from "../RowActionMenu";
import {
  TABLE_ROW_ACTIVE_FILTER_CLASS_NAME,
  TABLE_ROW_NAME_CELL_COLUMN_CLASS_NAME,
  TABLE_ROW_NAME_HEADER_COLUMN_CLASS_NAME
} from "../tableRowActionStyles";
import type { TableRowActivityChangeHandler, TableRowActivityId } from "../tableRowActivity";

type Props = {
  secretRotationName: string;
  environments: { name: string; slug: string }[];
  isSecretRotationInEnv: (name: string, env: string) => boolean;
  getSecretRotationByName: (slug: string, name: string) => TSecretRotationV2 | undefined;
  getSecretRotationStatusesByName: (name: string) => (SecretRotationStatus | null)[] | undefined;
  tableWidth: number;
  isSelected: boolean;
  onToggleRotationSelect: (name: string, isShiftKey: boolean) => void;
  onEdit: (secretRotation: TSecretRotationV2) => void;
  onRotate: (secretRotation: TSecretRotationV2) => void;
  onReconcile: (secretRotation: TSecretRotationV2) => void;
  onViewGeneratedCredentials: (secretRotation: TSecretRotationV2) => void;
  onDelete: (secretRotation: TSecretRotationV2) => void;
  onCheckActiveCredentials: (secretRotation: TSecretRotationV2) => Promise<void> | void;
  activityId: TableRowActivityId;
  onActivityChange: TableRowActivityChangeHandler;
};

const shouldShowReconciliationButton = (secretRotation: TSecretRotationV2) =>
  (secretRotation.type === SecretRotation.UnixLinuxLocalAccount &&
    secretRotation.parameters.rotationMethod ===
      UnixLinuxLocalAccountRotationMethod.LoginAsTarget) ||
  (secretRotation.type === SecretRotation.WindowsLocalAccount &&
    secretRotation.parameters.rotationMethod === WindowsLocalAccountRotationMethod.LoginAsTarget) ||
  (secretRotation.type === SecretRotation.HpIloLocalAccount &&
    secretRotation.parameters.rotationMethod === HpIloRotationMethod.LoginAsTarget);

export const SecretRotationTableRow = ({
  secretRotationName,
  environments = [],
  isSecretRotationInEnv,
  tableWidth,
  getSecretRotationByName,
  getSecretRotationStatusesByName,
  isSelected,
  onToggleRotationSelect,
  onEdit,
  onRotate,
  onViewGeneratedCredentials,
  onDelete,
  onReconcile,
  onCheckActiveCredentials,
  activityId,
  onActivityChange
}: Props) => {
  const [isExpanded, setIsExpanded] = useToggle(false);
  const [checkingRotationId, setCheckingRotationId] = useState<string | null>(null);
  const { permission } = useProjectPermission();

  const handleCheckActiveCredentials = async (secretRotation: TSecretRotationV2) => {
    if (checkingRotationId) return;
    setCheckingRotationId(secretRotation.id);
    try {
      await onCheckActiveCredentials(secretRotation);
    } finally {
      setCheckingRotationId(null);
    }
  };

  const isSingleEnvView = environments.length === 1;
  const totalCols = environments.length + 2; // secret key row + icon

  const statuses = getSecretRotationStatusesByName(secretRotationName);

  // Pre-compute single env data
  const singleEnvSlug = isSingleEnvView ? environments[0].slug : "";
  const singleEnvRotation = isSingleEnvView
    ? getSecretRotationByName(singleEnvSlug, secretRotationName)
    : undefined;

  useEffect(() => {
    onActivityChange(activityId, isExpanded);
  }, [activityId, isExpanded, onActivityChange]);

  useEffect(
    () => () => {
      onActivityChange(activityId, false);
    },
    [activityId, onActivityChange]
  );

  const getActions = (secretRotation: TSecretRotationV2): RowAction[] => {
    const resource = subject(ProjectPermissionSub.SecretRotation, {
      environment: secretRotation.environment.slug,
      secretPath: secretRotation.folder.path,
      ...(secretRotation.connectionId && { connectionId: secretRotation.connectionId })
    });
    const canRead = permission.can(
      ProjectPermissionSecretRotationActions.ReadGeneratedCredentials,
      resource
    );
    const canRotate = permission.can(
      ProjectPermissionSecretRotationActions.RotateSecrets,
      resource
    );
    const canEdit = permission.can(ProjectPermissionSecretRotationActions.Edit, resource);
    const canDelete = permission.can(ProjectPermissionSecretRotationActions.Delete, resource);
    const isCheckingRotation = checkingRotationId === secretRotation.id;

    return [
      {
        label: "Validate Credentials",
        icon: isCheckingRotation ? <LoaderCircleIcon className="animate-spin" /> : <ActivityIcon />,
        onSelect: () => handleCheckActiveCredentials(secretRotation),
        disabled: !canRead || Boolean(checkingRotationId)
      },
      {
        label: "View Generated Credentials",
        icon: <EyeIcon />,
        onSelect: () => onViewGeneratedCredentials(secretRotation),
        disabled: !canRead
      },
      {
        label: "Rotate Secret",
        icon: <RefreshCwIcon />,
        onSelect: () => onRotate(secretRotation),
        disabled: !canRotate
      },
      ...(shouldShowReconciliationButton(secretRotation)
        ? [
            {
              label: "Reconcile Secret",
              icon: <HandshakeIcon />,
              onSelect: () => onReconcile(secretRotation),
              disabled: !canRotate
            }
          ]
        : []),
      {
        label: "Edit",
        icon: <EditIcon />,
        onSelect: () => onEdit(secretRotation),
        disabled: !canEdit
      },
      {
        label: "Delete",
        icon: <TrashIcon />,
        onSelect: () => onDelete(secretRotation),
        disabled: !canDelete,
        danger: true
      }
    ];
  };

  return (
    <>
      <TableRow
        onClick={isSingleEnvView ? undefined : setIsExpanded.toggle}
        className={twMerge(
          "group hover:z-10",
          (isExpanded || isSelected) && TABLE_ROW_ACTIVE_FILTER_CLASS_NAME
        )}
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
            <Checkbox
              variant="project"
              id={`checkbox-${secretRotationName}`}
              isChecked={isSelected}
              onClick={(e) => {
                e.stopPropagation();
                onToggleRotationSelect(secretRotationName, e.shiftKey);
              }}
              className={twMerge("hidden group-hover:flex", isSelected && "flex")}
            />
            {!isSingleEnvView && isExpanded ? (
              <ChevronDownIcon
                className={twMerge("block", "group-hover:!hidden", isSelected && "!hidden")}
              />
            ) : (
              <RefreshCwIcon
                className={twMerge(
                  "block text-secret-rotation",
                  "group-hover:!hidden",
                  isSelected && "!hidden"
                )}
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
          {isSingleEnvView && singleEnvRotation ? (
            <div className="flex w-full items-center">
              <span className="min-w-0 truncate">{secretRotationName}</span>
              <Badge variant="neutral" className="mx-2.5 shrink-0">
                <ProviderIcon
                  icon={SECRET_ROTATION_MAP[singleEnvRotation.type].image}
                  style={{ width: "11px" }}
                  alt={`${SECRET_ROTATION_MAP[singleEnvRotation.type].name} logo`}
                />
                {SECRET_ROTATION_MAP[singleEnvRotation.type].name}
              </Badge>
              {singleEnvRotation.description && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="mr-2.5 !size-3 text-accent" />
                  </TooltipTrigger>
                  <TooltipContent>{singleEnvRotation.description}</TooltipContent>
                </Tooltip>
              )}
              <div className="ml-auto shrink-0">
                <SecretRotationV2StatusBadge secretRotation={singleEnvRotation} />
              </div>
              <div className="shrink-0">
                <RowActionMenu
                  label={`${secretRotationName} in ${environments[0].name}`}
                  actions={getActions(singleEnvRotation)}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center">
              <span className="min-w-0 truncate">{secretRotationName}</span>
              {statuses?.some((status) => status === SecretRotationStatus.Failed) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className="ml-auto shrink-0" variant="danger">
                      <XIcon />
                      Rotation Failed
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>One or more secrets failed to rotate.</TooltipContent>
                </Tooltip>
              )}
              <div className="ml-auto shrink-0">
                <RowActionMenu
                  label={secretRotationName}
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
            if (isExpanded) return <TableCell className="border-b-0 bg-container-hover" />;

            const isPresent = isSecretRotationInEnv(secretRotationName, slug);

            return (
              <ResourceEnvironmentStatusCell
                key={`sec-overview-${slug}-${i + 1}-folder`}
                status={isPresent ? "present" : "missing"}
              />
            );
          })}
      </TableRow>
      {!isSingleEnvView && isExpanded && (
        <TableRow
          className={twMerge("border-0 hover:bg-transparent", TABLE_ROW_ACTIVE_FILTER_CLASS_NAME)}
        >
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
                      const secretRotation = getSecretRotationByName(env.slug, secretRotationName);

                      return Boolean(secretRotation);
                    })
                    .map(({ name: envName, slug }) => {
                      const secretRotation = getSecretRotationByName(slug, secretRotationName)!;
                      const { type, description } = secretRotation;

                      const { name: rotationType, image } = SECRET_ROTATION_MAP[type];

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
                                  label={`${secretRotationName} in ${envName}`}
                                  actions={getActions(secretRotation)}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex w-full flex-wrap items-center">
                              <Badge variant="neutral">
                                <ProviderIcon
                                  icon={image}
                                  style={{
                                    width: "11px"
                                  }}
                                  alt={`${rotationType} logo`}
                                />
                                {rotationType}
                              </Badge>
                              {description && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <InfoIcon className="size-3 text-accent" />
                                  </TooltipTrigger>
                                  <TooltipContent>{description}</TooltipContent>
                                </Tooltip>
                              )}
                              <div className="ml-auto flex items-center">
                                <SecretRotationV2StatusBadge secretRotation={secretRotation} />
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
