import { useState } from "react";
import { subject } from "@casl/ability";
import {
  faAsterisk,
  faClose,
  faEdit,
  faInfoCircle,
  faKey,
  faRotate
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretRotationV2StatusBadge } from "@app/components/secret-rotations-v2/SecretRotationV2StatusBadge";
import { IconButton, Modal, ModalContent, TableContainer, Tag, Tooltip } from "@app/components/v2";
import { Blur } from "@app/components/v2/Blur";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretRotationActions } from "@app/context/ProjectPermissionContext/types";
import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";

type Props = {
  secretRotation: TSecretRotationV2;
  onEdit: () => void;
  onRotate: () => void;
  onViewGeneratedCredentials: () => void;
  onDelete: () => void;
};

export const SecretRotationItem = ({
  secretRotation,
  onEdit,
  onRotate,
  onViewGeneratedCredentials,
  onDelete
}: Props) => {
  const { name, type, environment, folder, secrets, description } = secretRotation;

  const { name: rotationType, image } = SECRET_ROTATION_MAP[type];
  const [showSecrets, setShowSecrets] = useState(false);

  return (
    <>
      <div className={twMerge("group flex border-b border-mineshaft-600 hover:bg-mineshaft-700")}>
        <div className="text- flex w-11 items-center py-2 pl-5 text-mineshaft-400">
          <FontAwesomeIcon icon={faRotate} />
        </div>
        <div className="flex flex-grow items-center border-r border-mineshaft-600 py-2 pl-4 pr-2">
          <div className="flex w-full flex-wrap items-center">
            <span>{name}</span>
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
                <FontAwesomeIcon icon={faInfoCircle} className="text-mineshaft-400" />
              </Tooltip>
            )}
          </div>
          <SecretRotationV2StatusBadge className="mx-2" secretRotation={secretRotation} />
          <div
            key="actions"
            className="flex h-full flex-shrink-0 self-start transition-all group-hover:gap-x-2"
          >
            <Tooltip content="View Rotation Secrets">
              <IconButton
                ariaLabel="View rotation secrets"
                variant="plain"
                size="sm"
                className="w-0 overflow-hidden p-0 group-hover:w-5"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSecrets(true);
                }}
              >
                <FontAwesomeIcon icon={faKey} />
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
                  className="w-0 overflow-hidden p-0 group-hover:w-5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewGeneratedCredentials();
                  }}
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
                  className="w-0 overflow-hidden p-0 group-hover:w-5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRotate();
                  }}
                >
                  <FontAwesomeIcon icon={faRotate} />
                </IconButton>
              )}
            </ProjectPermissionCan>
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key="options"
            className="flex h-10 flex-shrink-0 items-center space-x-1 px-[0.665rem]"
            initial={{ x: 0, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 10, opacity: 0 }}
          >
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
                  className="opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
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
                  className="opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  isDisabled={!isAllowed}
                >
                  <FontAwesomeIcon icon={faClose} size="lg" />
                </IconButton>
              )}
            </ProjectPermissionCan>
          </motion.div>
        </AnimatePresence>
      </div>
      <Modal onOpenChange={setShowSecrets} isOpen={showSecrets}>
        <ModalContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="max-w-3xl"
          title="Rotation Secrets"
        >
          <TableContainer>
            <table className="secret-table">
              <tbody>
                {secrets.map((secret, index) => {
                  return (
                    <Tooltip
                      className="max-w-sm"
                      content={
                        secret ? undefined : "You do not have permission to view this secret."
                      }
                    >
                      <tr
                        // eslint-disable-next-line react/no-array-index-key
                        key={`rotation-secret-${secretRotation.id}-${index}`}
                        className="h-full last:!border-b-0 hover:bg-mineshaft-700"
                      >
                        <td className="flex h-full items-center" style={{ padding: "0.5rem 1rem" }}>
                          <span className={twMerge(!secret && "blur")}>
                            {secret?.key ?? "********"}
                          </span>
                        </td>
                        <td className="col-span-2 h-full w-full" style={{ padding: "0.5rem 1rem" }}>
                          {/* eslint-disable-next-line no-nested-ternary */}
                          {!secret ? (
                            <div className="h-full pl-4 blur">********</div>
                          ) : secret.secretValueHidden ? (
                            <Blur
                              className="py-0"
                              tooltipText="You do not have permission to read the value of this secret."
                            />
                          ) : (
                            <InfisicalSecretInput
                              isReadOnly
                              value={secret.value}
                              secretPath={secretRotation.folder.path}
                              environment={secretRotation.environment.slug}
                              onChange={() => {}}
                            />
                          )}
                        </td>
                      </tr>
                    </Tooltip>
                  );
                })}
              </tbody>
            </table>
          </TableContainer>
        </ModalContent>
      </Modal>
    </>
  );
};
