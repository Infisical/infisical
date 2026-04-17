import { subject } from "@casl/ability";
import {
  AsteriskIcon,
  ChevronDownIcon,
  EditIcon,
  HandshakeIcon,
  InfoIcon,
  RefreshCwIcon,
  TrashIcon,
  XIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretRotationV2StatusBadge } from "@app/components/secret-rotations-v2/SecretRotationV2StatusBadge";
import {
  Badge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
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

type Props = {
  secretRotationName: string;
  environments: { name: string; slug: string }[];
  isSecretRotationInEnv: (name: string, env: string) => boolean;
  getSecretRotationByName: (slug: string, name: string) => TSecretRotationV2 | undefined;
  getSecretRotationStatusesByName: (name: string) => (SecretRotationStatus | null)[] | undefined;
  tableWidth: number;
  onEdit: (secretRotation: TSecretRotationV2) => void;
  onRotate: (secretRotation: TSecretRotationV2) => void;
  onReconcile: (secretRotation: TSecretRotationV2) => void;
  onViewGeneratedCredentials: (secretRotation: TSecretRotationV2) => void;
  onDelete: (secretRotation: TSecretRotationV2) => void;
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
  onEdit,
  onRotate,
  onViewGeneratedCredentials,
  onDelete,
  onReconcile
}: Props) => {
  const [isExpanded, setIsExpanded] = useToggle(false);

  const isSingleEnvView = environments.length === 1;
  const totalCols = environments.length + 2; // secret key row + icon

  const statuses = getSecretRotationStatusesByName(secretRotationName);

  // Pre-compute single env data
  const singleEnvSlug = isSingleEnvView ? environments[0].slug : "";
  const singleEnvRotation = isSingleEnvView
    ? getSecretRotationByName(singleEnvSlug, secretRotationName)
    : undefined;

  const renderActionButtons = (secretRotation: TSecretRotationV2) => {
    const { environment, folder } = secretRotation;

    const showReconcileButton = shouldShowReconciliationButton(secretRotation);

    return (
      <div
        className={twMerge(
          "flex items-center rounded-md border border-border bg-container-hover px-0.5 py-0.5 shadow-md",
          "pointer-events-none opacity-0 transition-all duration-300",
          "group-hover:pointer-events-auto group-hover:gap-1 group-hover:opacity-100"
        )}
      >
        <ProjectPermissionCan
          I={ProjectPermissionSecretRotationActions.ReadGeneratedCredentials}
          a={subject(ProjectPermissionSub.SecretRotation, {
            environment: environment.slug,
            secretPath: folder.path,
            ...(secretRotation.connectionId && {
              connectionId: secretRotation.connectionId
            })
          })}
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger>
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7"
                  isDisabled={!isAllowed}
                  onClick={() => onViewGeneratedCredentials(secretRotation)}
                >
                  <AsteriskIcon />
                </UnstableIconButton>
              </TooltipTrigger>
              <TooltipContent>View Generated Credentials</TooltipContent>
            </Tooltip>
          )}
        </ProjectPermissionCan>
        <ProjectPermissionCan
          I={ProjectPermissionSecretRotationActions.RotateSecrets}
          a={subject(ProjectPermissionSub.SecretRotation, {
            environment: environment.slug,
            secretPath: folder.path,
            ...(secretRotation.connectionId && {
              connectionId: secretRotation.connectionId
            })
          })}
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger>
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7"
                  isDisabled={!isAllowed}
                  onClick={() => onRotate(secretRotation)}
                >
                  <RefreshCwIcon />
                </UnstableIconButton>
              </TooltipTrigger>
              <TooltipContent>Rotate Secret</TooltipContent>
            </Tooltip>
          )}
        </ProjectPermissionCan>
        {showReconcileButton && (
          <ProjectPermissionCan
            I={ProjectPermissionSecretRotationActions.RotateSecrets}
            a={subject(ProjectPermissionSub.SecretRotation, {
              environment: environment.slug,
              secretPath: folder.path,
              ...(secretRotation.connectionId && {
                connectionId: secretRotation.connectionId
              })
            })}
          >
            {(isAllowed) => (
              <Tooltip>
                <TooltipTrigger>
                  <UnstableIconButton
                    variant="ghost"
                    size="xs"
                    className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7"
                    isDisabled={!isAllowed}
                    onClick={() => onReconcile(secretRotation)}
                  >
                    <HandshakeIcon />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>Reconcile Secret</TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
        )}
        <ProjectPermissionCan
          I={ProjectPermissionSecretRotationActions.Edit}
          a={subject(ProjectPermissionSub.SecretRotation, {
            environment: environment.slug,
            secretPath: folder.path,
            ...(secretRotation.connectionId && {
              connectionId: secretRotation.connectionId
            })
          })}
          renderTooltip
          allowedLabel="Edit"
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger>
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7"
                  isDisabled={!isAllowed}
                  onClick={() => onEdit(secretRotation)}
                >
                  <EditIcon />
                </UnstableIconButton>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
          )}
        </ProjectPermissionCan>
        <ProjectPermissionCan
          I={ProjectPermissionSecretRotationActions.Delete}
          a={subject(ProjectPermissionSub.SecretRotation, {
            environment: environment.slug,
            secretPath: folder.path,
            ...(secretRotation.connectionId && {
              connectionId: secretRotation.connectionId
            })
          })}
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger>
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7 hover:text-danger"
                  onClick={() => onDelete(secretRotation)}
                  isDisabled={!isAllowed}
                >
                  <TrashIcon />
                </UnstableIconButton>
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
      <UnstableTableRow
        onClick={isSingleEnvView ? undefined : setIsExpanded.toggle}
        className="group hover:z-10"
      >
        <UnstableTableCell
          className={twMerge(
            !isSingleEnvView && "sticky left-0 z-10",
            "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            !isSingleEnvView && isExpanded && "border-b-0 bg-container-hover"
          )}
        >
          {!isSingleEnvView && isExpanded ? (
            <ChevronDownIcon />
          ) : (
            <RefreshCwIcon className="text-secret-rotation" />
          )}
        </UnstableTableCell>
        <UnstableTableCell
          className={twMerge(
            !isSingleEnvView && "sticky left-10 z-10 border-r",
            "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            !isSingleEnvView && isExpanded && "border-r-0 border-b-0 bg-container-hover"
          )}
          isTruncatable
          colSpan={isSingleEnvView ? 2 : undefined}
        >
          {isSingleEnvView && singleEnvRotation ? (
            <div className="relative flex w-full items-center">
              <span className="truncate">{secretRotationName}</span>
              <Badge variant="neutral" className="mx-2.5">
                <img
                  src={`/images/integrations/${SECRET_ROTATION_MAP[singleEnvRotation.type].image}`}
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
              {isSingleEnvView && singleEnvRotation && (
                <>
                  <div
                    className={twMerge(
                      "ml-auto flex items-center transition-[margin] duration-300",
                      shouldShowReconciliationButton(singleEnvRotation)
                        ? "group-hover:mr-40"
                        : "group-hover:mr-32"
                    )}
                  >
                    <SecretRotationV2StatusBadge secretRotation={singleEnvRotation} />
                  </div>
                  <div className="absolute top-1/2 -right-2.5 z-20 -translate-y-1/2">
                    {renderActionButtons(singleEnvRotation)}
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              {secretRotationName}
              {statuses?.some((status) => status === SecretRotationStatus.Failed) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className="absolute top-1/2 right-2 -translate-y-1/2" variant="danger">
                      <XIcon />
                      Rotation Failed
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>One or more secrets failed to rotate.</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </UnstableTableCell>
        {environments.length > 1 &&
          environments.map(({ slug }, i) => {
            if (isExpanded) return <UnstableTableCell className="border-b-0 bg-container-hover" />;

            const isPresent = isSecretRotationInEnv(secretRotationName, slug);

            return (
              <ResourceEnvironmentStatusCell
                key={`sec-overview-${slug}-${i + 1}-folder`}
                status={isPresent ? "present" : "missing"}
              />
            );
          })}
      </UnstableTableRow>
      {!isSingleEnvView && isExpanded && (
        <UnstableTableRow>
          <UnstableTableCell colSpan={totalCols} className={`${isExpanded && "bg-card p-0"}`}>
            <div
              style={{ minWidth: tableWidth, maxWidth: tableWidth }}
              className="sticky left-0 flex flex-col gap-y-4 border-t-2 border-b-1 border-l-1 border-border border-x-project/50 bg-card p-4"
            >
              <UnstableTable containerClassName="border-none rounded-none bg-transparent">
                <UnstableTableHeader>
                  <UnstableTableRow>
                    <UnstableTableHead className="w-full">Environment</UnstableTableHead>
                    <UnstableTableHead />
                  </UnstableTableRow>
                </UnstableTableHeader>
                <UnstableTableBody>
                  {environments
                    .filter((env) => {
                      const secretRotation = getSecretRotationByName(env.slug, secretRotationName);

                      return Boolean(secretRotation);
                    })
                    .map(({ name: envName, slug }) => {
                      const secretRotation = getSecretRotationByName(slug, secretRotationName)!;
                      const { type, description } = secretRotation;

                      const { name: rotationType, image } = SECRET_ROTATION_MAP[type];

                      const showReconcileButton = shouldShowReconciliationButton(secretRotation);

                      return (
                        <UnstableTableRow key={slug} className="group relative hover:z-10">
                          <UnstableTableCell colSpan={2}>
                            <div className="relative flex w-full flex-wrap items-center">
                              <span>{envName}</span>
                              <Badge variant="neutral" className="mx-2.5">
                                <img
                                  src={`/images/integrations/${image}`}
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
                              <div
                                className={twMerge(
                                  "ml-auto flex items-center transition-[margin] duration-300",
                                  showReconcileButton ? "group-hover:mr-40" : "group-hover:mr-32"
                                )}
                              >
                                <SecretRotationV2StatusBadge secretRotation={secretRotation} />
                              </div>
                              <div className="absolute top-1/2 -right-1.5 z-20 -translate-y-1/2">
                                {renderActionButtons(secretRotation)}
                              </div>
                            </div>
                          </UnstableTableCell>
                        </UnstableTableRow>
                      );
                    })}
                </UnstableTableBody>
              </UnstableTable>
            </div>
          </UnstableTableCell>
        </UnstableTableRow>
      )}
    </>
  );
};
