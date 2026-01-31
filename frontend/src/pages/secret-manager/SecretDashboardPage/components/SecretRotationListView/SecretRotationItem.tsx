import { useState } from "react";
import { subject } from "@casl/ability";
import {
  faAsterisk,
  faEdit,
  faHandshake,
  faInfoCircle,
  faKey,
  faRotate,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretRotationV2StatusBadge } from "@app/components/secret-rotations-v2/SecretRotationV2StatusBadge";
import { IconButton, Modal, ModalContent, TableContainer, Tag, Tooltip } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretRotationActions } from "@app/context/ProjectPermissionContext/types";
import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { UsedBySecretSyncs } from "@app/hooks/api/dashboard/types";
import { SecretRotation, TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { UnixLinuxLocalAccountRotationMethod } from "@app/hooks/api/secretRotationsV2/types/unix-linux-local-account-rotation";
import { WindowsLocalAccountRotationMethod } from "@app/hooks/api/secretRotationsV2/types/windows-local-account-rotation";
import { SecretV3RawSanitized, WsTag } from "@app/hooks/api/types";

import { SecretListView } from "../SecretListView";
import { SecretRotationSecretRow } from "./SecretRotationSecretRow";

type Props = {
  secretRotation: TSecretRotationV2;
  onEdit: () => void;
  onRotate: () => void;
  onReconcile: () => void;
  onViewGeneratedCredentials: () => void;
  onDelete: () => void;
  projectId: string;
  secretPath?: string;
  tags?: WsTag[];
  isProtectedBranch?: boolean;
  usedBySecretSyncs?: UsedBySecretSyncs[];
  importedBy?: {
    environment: { name: string; slug: string };
    folders: {
      name: string;
      secrets?: { secretId: string; referencedSecretKey: string; referencedSecretEnv: string }[];
      isImported: boolean;
    }[];
  }[];
  colWidth: number;
  getMergedSecretsWithPending: (
    paramSecrets?: (SecretV3RawSanitized | null)[]
  ) => SecretV3RawSanitized[];
};

export const SecretRotationItem = ({
  secretRotation,
  onEdit,
  onRotate,
  onReconcile,
  onViewGeneratedCredentials,
  onDelete,
  projectId,
  secretPath = "/",
  tags = [],
  isProtectedBranch = false,
  usedBySecretSyncs,
  importedBy,
  colWidth,
  getMergedSecretsWithPending
}: Props) => {
  const { name, type, environment, folder, secrets, description } = secretRotation;

  const { name: rotationType, image } = SECRET_ROTATION_MAP[type];
  const [showSecrets, setShowSecrets] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <>
      <div
        className={twMerge(
          "group flex cursor-pointer border-b border-mineshaft-600 hover:bg-mineshaft-700"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "Collapse" : "Expand"} rotation secrets for ${name}`}
      >
        <div className="text- flex w-11 items-center py-2 pl-5 text-mineshaft-400">
          <FontAwesomeIcon icon={faRotate} />
        </div>
        <div className="flex grow items-center py-2 pr-2 pl-4">
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
          <SecretRotationV2StatusBadge secretRotation={secretRotation} />
          <div
            key="actions"
            className="ml-2 flex h-full shrink-0 self-start transition-all group-hover:gap-x-2"
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
            {((secretRotation.type === SecretRotation.UnixLinuxLocalAccount &&
              secretRotation.parameters.rotationMethod ===
                UnixLinuxLocalAccountRotationMethod.LoginAsTarget) ||
              (secretRotation.type === SecretRotation.WindowsLocalAccount &&
                secretRotation.parameters.rotationMethod ===
                  WindowsLocalAccountRotationMethod.LoginAsTarget)) && (
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
                    className="w-0 overflow-hidden p-0 group-hover:w-5"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReconcile();
                    }}
                  >
                    <FontAwesomeIcon icon={faHandshake} />
                  </IconButton>
                )}
              </ProjectPermissionCan>
            )}
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key="options"
            className="flex w-16 items-center justify-between border-l border-mineshaft-600 px-2 py-3"
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
                  className="opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  isDisabled={!isAllowed}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              )}
            </ProjectPermissionCan>
          </motion.div>
        </AnimatePresence>
      </div>
      {isExpanded && (
        <SecretListView
          colWidth={colWidth}
          secrets={getMergedSecretsWithPending(secretRotation.secrets) || []}
          tags={tags}
          environment={environment.slug}
          projectId={projectId}
          secretPath={secretPath}
          isProtectedBranch={isProtectedBranch}
          importedBy={importedBy}
          usedBySecretSyncs={usedBySecretSyncs}
          excludePendingCreates
        />
      )}
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
                    <SecretRotationSecretRow
                      // eslint-disable-next-line react/no-array-index-key
                      key={`rotation-secret-${secretRotation.id}-${index}`}
                      secret={secret}
                      environment={secretRotation.environment.slug}
                      secretPath={secretRotation.folder.path}
                    />
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
