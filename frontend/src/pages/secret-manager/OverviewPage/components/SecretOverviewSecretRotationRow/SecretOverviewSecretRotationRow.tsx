import { subject } from "@casl/ability";
import {
  faAsterisk,
  faCheck,
  faClose,
  faEdit,
  faEye,
  faEyeSlash,
  faHandshake,
  faInfoCircle,
  faRotate,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { XIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretRotationV2StatusBadge } from "@app/components/secret-rotations-v2/SecretRotationV2StatusBadge";
import { IconButton, TableContainer, Tag, Td, Tooltip, Tr } from "@app/components/v2";
import { Badge } from "@app/components/v3";
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
import { SshPasswordRotationMethod } from "@app/hooks/api/secretRotationsV2/types/ssh-password-rotation";
import { getExpandedRowStyle } from "@app/pages/secret-manager/OverviewPage/components/utils";

import { SecretOverviewRotationSecretRow } from "./SecretOverviewRotationSecretRow";

type Props = {
  secretRotationName: string;
  environments: { name: string; slug: string }[];
  isSecretRotationInEnv: (name: string, env: string) => boolean;
  getSecretRotationByName: (slug: string, name: string) => TSecretRotationV2 | undefined;
  getSecretRotationStatusesByName: (name: string) => (SecretRotationStatus | null)[] | undefined;
  scrollOffset: number;
  onEdit: (secretRotation: TSecretRotationV2) => void;
  onRotate: (secretRotation: TSecretRotationV2) => void;
  onReconcile: (secretRotation: TSecretRotationV2) => void;
  onViewGeneratedCredentials: (secretRotation: TSecretRotationV2) => void;
  onDelete: (secretRotation: TSecretRotationV2) => void;
};

export const SecretOverviewSecretRotationRow = ({
  secretRotationName,
  environments = [],
  isSecretRotationInEnv,
  scrollOffset,
  getSecretRotationByName,
  getSecretRotationStatusesByName,
  onEdit,
  onRotate,
  onViewGeneratedCredentials,
  onDelete,
  onReconcile
}: Props) => {
  const [isExpanded, setIsExpanded] = useToggle(false);
  const [isSecretVisible, setIsSecretVisible] = useToggle();

  const totalCols = environments.length + 1; // secret key row

  const statuses = getSecretRotationStatusesByName(secretRotationName);

  return (
    <>
      <Tr isHoverable isSelectable onClick={setIsExpanded.toggle} className="group">
        <Td className="sticky left-0 z-10 border-0 bg-mineshaft-800 bg-clip-padding p-0 group-hover:bg-mineshaft-700">
          <div className="flex w-full items-center space-x-5 border-r border-mineshaft-600 py-2.5 pr-2 pl-5">
            <div className="text-mineshaft-400">
              <FontAwesomeIcon icon={faRotate} />
            </div>
            <div className="flex-1">{secretRotationName}</div>
            {statuses?.some((status) => status === SecretRotationStatus.Failed) && (
              <Tooltip className="max-w-sm" content="One or more secrets failed to rotate.">
                <Badge variant="danger">
                  <XIcon />
                  Rotation Failed
                </Badge>
              </Tooltip>
            )}
          </div>
        </Td>
        {environments.map(({ slug }, i) => {
          const isPresent = isSecretRotationInEnv(secretRotationName, slug);

          return (
            <Td
              key={`sec-overview-${slug}-${i + 1}-folder`}
              className={twMerge(
                "border-r border-mineshaft-600 py-3 group-hover:bg-mineshaft-700",
                isPresent ? "text-green-600" : "text-red-600"
              )}
            >
              <div className="mx-auto flex w-[0.03rem] justify-center">
                <FontAwesomeIcon
                  // eslint-disable-next-line no-nested-ternary
                  icon={isPresent ? faCheck : faXmark}
                />
              </div>
            </Td>
          );
        })}
      </Tr>
      {isExpanded &&
        environments.map(({ name: envName, slug }) => {
          const secretRotation = getSecretRotationByName(slug, secretRotationName);

          if (!secretRotation) return null;

          const { type, secrets, environment, folder, description } = secretRotation;

          const { name: rotationType, image } = SECRET_ROTATION_MAP[type];

          return (
            <Tr key={`secret-rotation-${slug}-${secretRotationName}`}>
              <Td
                colSpan={totalCols}
                className={`bg-bunker-600 px-0 py-0 ${isExpanded && "border-b-2 border-mineshaft-500"}`}
              >
                <div style={getExpandedRowStyle(scrollOffset)} className="ml-2 p-2">
                  <TableContainer>
                    <table className="secret-table">
                      <thead className="border-b!">
                        <tr className="h-10">
                          <th
                            style={{ padding: "0.5rem 1rem" }}
                            className="min-table-row min-w-[30vw] border-r-0!"
                          >
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
                                <Tooltip content={description}>
                                  <FontAwesomeIcon
                                    icon={faInfoCircle}
                                    className="text-mineshaft-400"
                                  />
                                </Tooltip>
                              )}
                            </div>
                          </th>
                          <div className="absolute top-0.5 right-1 mt-1 mr-1 ml-auto w-min">
                            <div className="flex items-center gap-2">
                              <SecretRotationV2StatusBadge secretRotation={secretRotation} />
                              <Tooltip content={isSecretVisible ? "Hide Values" : "Reveal Values"}>
                                <IconButton
                                  ariaLabel={isSecretVisible ? "Hide Values" : "Reveal Values"}
                                  variant="plain"
                                  size="md"
                                  onClick={() => setIsSecretVisible.toggle()}
                                >
                                  <FontAwesomeIcon icon={isSecretVisible ? faEyeSlash : faEye} />
                                </IconButton>
                              </Tooltip>
                              <ProjectPermissionCan
                                I={ProjectPermissionSecretRotationActions.ReadGeneratedCredentials}
                                a={subject(ProjectPermissionSub.SecretRotation, {
                                  environment: environment.slug,
                                  secretPath: folder.path
                                })}
                                renderTooltip
                                allowedLabel="View Generated Credentials"
                              >
                                {(isAllowed) => (
                                  <IconButton
                                    ariaLabel="View generated credentials"
                                    variant="plain"
                                    size="sm"
                                    isDisabled={!isAllowed}
                                    onClick={() => onViewGeneratedCredentials(secretRotation)}
                                  >
                                    <FontAwesomeIcon icon={faAsterisk} />
                                  </IconButton>
                                )}
                              </ProjectPermissionCan>
                              <ProjectPermissionCan
                                I={ProjectPermissionSecretRotationActions.RotateSecrets}
                                a={subject(ProjectPermissionSub.SecretRotation, {
                                  environment: environment.slug,
                                  secretPath: folder.path
                                })}
                                renderTooltip
                                allowedLabel="Rotate Secrets"
                              >
                                {(isAllowed) => (
                                  <IconButton
                                    ariaLabel="Rotate secrets"
                                    variant="plain"
                                    size="sm"
                                    isDisabled={!isAllowed}
                                    onClick={() => onRotate(secretRotation)}
                                  >
                                    <FontAwesomeIcon icon={faRotate} />
                                  </IconButton>
                                )}
                              </ProjectPermissionCan>
                              {secretRotation.type === SecretRotation.SshPassword &&
                                secretRotation.parameters.rotationMethod ===
                                  SshPasswordRotationMethod.LoginAsTarget && (
                                  <ProjectPermissionCan
                                    I={ProjectPermissionSecretRotationActions.RotateSecrets}
                                    a={subject(ProjectPermissionSub.SecretRotation, {
                                      environment: environment.slug,
                                      secretPath: folder.path
                                    })}
                                    renderTooltip
                                    allowedLabel="Reconcile Secret"
                                  >
                                    {(isAllowed) => (
                                      <IconButton
                                        ariaLabel="Reconcile secret"
                                        variant="plain"
                                        size="sm"
                                        isDisabled={!isAllowed}
                                        onClick={() => onReconcile(secretRotation)}
                                      >
                                        <FontAwesomeIcon icon={faHandshake} />
                                      </IconButton>
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
                                  <IconButton
                                    ariaLabel="Edit rotation"
                                    variant="plain"
                                    size="md"
                                    isDisabled={!isAllowed}
                                    onClick={() => onEdit(secretRotation)}
                                  >
                                    <FontAwesomeIcon icon={faEdit} />
                                  </IconButton>
                                )}
                              </ProjectPermissionCan>
                              <ProjectPermissionCan
                                I={ProjectPermissionSecretRotationActions.Delete}
                                a={subject(ProjectPermissionSub.SecretRotation, {
                                  environment: environment.slug,
                                  secretPath: folder.path
                                })}
                                renderTooltip
                                allowedLabel="Delete"
                              >
                                {(isAllowed) => (
                                  <IconButton
                                    ariaLabel="Delete rotation"
                                    variant="plain"
                                    colorSchema="danger"
                                    size="md"
                                    onClick={() => onDelete(secretRotation)}
                                    isDisabled={!isAllowed}
                                  >
                                    <FontAwesomeIcon icon={faClose} size="lg" />
                                  </IconButton>
                                )}
                              </ProjectPermissionCan>
                            </div>
                          </div>
                        </tr>
                      </thead>
                      <tbody className="border-t-2 border-mineshaft-600">
                        {secrets.map((secret, index) => {
                          return (
                            <SecretOverviewRotationSecretRow
                              key={`rotation-secret-${secretRotation.id}-${index + 1}`}
                              secret={secret}
                              secretPath={secretRotation.folder.path}
                              environment={secretRotation.environment.slug}
                              isSecretVisible={isSecretVisible}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </TableContainer>
                </div>
              </Td>
            </Tr>
          );
        })}
    </>
  );
};
