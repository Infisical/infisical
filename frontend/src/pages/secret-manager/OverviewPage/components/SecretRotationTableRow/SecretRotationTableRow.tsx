import { subject } from "@casl/ability";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
import { Tag } from "@app/components/v2";
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
import { UnixLinuxLocalAccountRotationMethod } from "@app/hooks/api/secretRotationsV2/types/unix-linux-local-account-rotation";

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

  const totalCols = environments.length + 2; // secret key row + icon

  const statuses = getSecretRotationStatusesByName(secretRotationName);

  return (
    <>
      <UnstableTableRow onClick={setIsExpanded.toggle} className="group">
        <UnstableTableCell
          className={twMerge(
            "sticky left-0 z-10 bg-container transition-colors duration-75 group-hover:bg-container-hover",
            isExpanded && "border-b-0 bg-container-hover"
          )}
        >
          {isExpanded ? <ChevronDownIcon /> : <RefreshCwIcon className="text-secret-rotation" />}
        </UnstableTableCell>
        <UnstableTableCell
          className={twMerge(
            "sticky left-10 z-10 border-r bg-container transition-colors duration-75 group-hover:bg-container-hover",
            isExpanded && "border-r-0 border-b-0 bg-container-hover"
          )}
          isTruncatable
        >
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
        </UnstableTableCell>
        {environments.map(({ slug }, i) => {
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
      {isExpanded && (
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
                    <UnstableTableHead>Status</UnstableTableHead>
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
                      const { type, environment, folder, description } = secretRotation;

                      const { name: rotationType, image } = SECRET_ROTATION_MAP[type];

                      return (
                        <UnstableTableRow className="group relative">
                          <UnstableTableCell>
                            <div className="flex w-full flex-wrap items-center">
                              <span>{envName}</span>
                              <Tag className="mx-2.5 flex items-center gap-1 px-1.5 py-0 text-xs normal-case">
                                <img
                                  src={`/images/integrations/${image}`}
                                  style={{
                                    width: "11px"
                                  }}
                                  alt={`${rotationType} logo`}
                                />
                                {rotationType}
                              </Tag>
                              {description && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <InfoIcon className="size-4 text-accent" />
                                  </TooltipTrigger>
                                  <TooltipContent>{description}</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </UnstableTableCell>
                          <UnstableTableCell>
                            <div className="flex items-center">
                              <SecretRotationV2StatusBadge secretRotation={secretRotation} />
                              <div className="ml-2 flex w-min items-center gap-2 opacity-0 transition-opacity duration-75 group-hover:opacity-100">
                                <ProjectPermissionCan
                                  I={
                                    ProjectPermissionSecretRotationActions.ReadGeneratedCredentials
                                  }
                                  a={subject(ProjectPermissionSub.SecretRotation, {
                                    environment: environment.slug,
                                    secretPath: folder.path
                                  })}
                                >
                                  {(isAllowed) => (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <UnstableIconButton
                                          variant="ghost"
                                          size="xs"
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
                                    secretPath: folder.path
                                  })}
                                >
                                  {(isAllowed) => (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <UnstableIconButton
                                          variant="ghost"
                                          size="xs"
                                          isDisabled={!isAllowed}
                                          onClick={() => onRotate(secretRotation)}
                                        >
                                          <FontAwesomeIcon icon={faRotate} />
                                        </UnstableIconButton>
                                      </TooltipTrigger>
                                      <TooltipContent>Rotate Secret</TooltipContent>
                                    </Tooltip>
                                  )}
                                </ProjectPermissionCan>
                                {secretRotation.type === SecretRotation.UnixLinuxLocalAccount &&
                                  secretRotation.parameters.rotationMethod ===
                                    UnixLinuxLocalAccountRotationMethod.LoginAsTarget && (
                                    <ProjectPermissionCan
                                      I={ProjectPermissionSecretRotationActions.RotateSecrets}
                                      a={subject(ProjectPermissionSub.SecretRotation, {
                                        environment: environment.slug,
                                        secretPath: folder.path
                                      })}
                                    >
                                      {(isAllowed) => (
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <UnstableIconButton
                                              variant="ghost"
                                              size="xs"
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
                                    secretPath: folder.path
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
                                    secretPath: folder.path
                                  })}
                                >
                                  {(isAllowed) => (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <UnstableIconButton
                                          variant="ghost"
                                          size="xs"
                                          className="hover:text-red"
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
