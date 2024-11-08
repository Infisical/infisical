import { subject } from "@casl/ability";
import {
  faClose,
  faFingerprint,
  faPencilSquare,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  IconButton,
  Modal,
  ModalContent,
  Tag,
  Tooltip
} from "@app/components/v2";
import { ProjectPermissionDynamicSecretActions, ProjectPermissionSub } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteDynamicSecret } from "@app/hooks/api";
import {
  DynamicSecretProviders,
  DynamicSecretStatus,
  TDynamicSecret
} from "@app/hooks/api/dynamicSecret/types";

import { CreateDynamicSecretLease } from "./CreateDynamicSecretLease";
import { DynamicSecretLease } from "./DynamicSecretLease";
import { EditDynamicSecretForm } from "./EditDynamicSecretForm";

const formatProviderName = (type: DynamicSecretProviders) => {
  if (type === DynamicSecretProviders.SqlDatabase) return "SQL Database";
  return "";
};

type Props = {
  dynamicSecrets?: TDynamicSecret[];
  environment: string;
  projectSlug: string;
  secretPath?: string;
};

export const DynamicSecretListView = ({
  dynamicSecrets = [],
  environment,
  projectSlug,
  secretPath = "/"
}: Props) => {
  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "dynamicSecretLeases",
    "createDynamicSecretLease",
    "updateDynamicSecret",
    "deleteDynamicSecret"
  ] as const);

  const deleteDynamicSecret = useDeleteDynamicSecret();

  const handleDynamicSecretDelete = async () => {
    try {
      const { name, isForced } = popUp.deleteDynamicSecret.data as TDynamicSecret & {
        isForced?: boolean;
      };
      await deleteDynamicSecret.mutateAsync({
        environmentSlug: environment,
        projectSlug,
        path: secretPath,
        name,
        isForced
      });
      handlePopUpClose("deleteDynamicSecret");
      createNotification({
        type: "success",
        text: "Successfully deleted dynamic secret"
      });
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to delete dynamic secret"
      });
    }
  };

  return (
    <>
      {dynamicSecrets.map((secret) => {
        const isRevoking = secret.status === DynamicSecretStatus.Deleting;
        return (
          <Modal
            key={secret.id}
            isOpen={
              popUp.dynamicSecretLeases.isOpen && popUp.dynamicSecretLeases.data === secret.id
            }
            onOpenChange={(state) => handlePopUpToggle("dynamicSecretLeases", state)}
          >
            <div
              className="group flex cursor-pointer border-b border-mineshaft-600 hover:bg-mineshaft-700"
              role="button"
              tabIndex={0}
              onKeyDown={(evt) => {
                if (evt.key === "Enter" && !isRevoking)
                  handlePopUpOpen("dynamicSecretLeases", secret.id);
              }}
              onClick={() => {
                if (!isRevoking) {
                  handlePopUpOpen("dynamicSecretLeases", secret.id);
                }
              }}
            >
              <div className="flex w-11 items-center px-5 py-3 text-yellow-700">
                <FontAwesomeIcon icon={faFingerprint} />
              </div>
              <div className="flex flex-grow items-center px-4 py-3" role="button" tabIndex={0}>
                {secret.name}
                <Tag className="ml-4 py-0 px-2 text-xs normal-case">
                  {formatProviderName(secret.type)}
                </Tag>
                {Boolean(secret.status) && (
                  <Tooltip content={secret?.statusDetails || secret.status || ""}>
                    <FontAwesomeIcon
                      className={
                        secret.status === DynamicSecretStatus.Deleting
                          ? "text-yellow-600"
                          : "text-red-600"
                      }
                      icon={faWarning}
                    />
                  </Tooltip>
                )}
              </div>
              <div className="flex items-center space-x-2 px-4 py-2">
                <ProjectPermissionCan
                  I={ProjectPermissionDynamicSecretActions.Lease}
                  a={subject(ProjectPermissionSub.DynamicSecrets, { environment, secretPath })}
                  renderTooltip
                  allowedLabel="Edit"
                >
                  {(isAllowed) => (
                    <Button
                      size="xs"
                      className="m-0 py-0.5 px-2 opacity-0 group-hover:opacity-100"
                      isDisabled={isRevoking || !isAllowed}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        handlePopUpOpen("createDynamicSecretLease", secret);
                      }}
                    >
                      Generate
                    </Button>
                  )}
                </ProjectPermissionCan>

                {secret.status === DynamicSecretStatus.FailedDeletion && (
                  <Tooltip content="This action will remove the secret from internal storage, but it will remain in external systems. Use this option only after you've confirmed that your external leases are handled.">
                    <Button
                      size="xs"
                      className="m-0 py-0.5 px-2"
                      colorSchema="danger"
                      isDisabled={isRevoking}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        handlePopUpOpen("deleteDynamicSecret", {
                          ...secret,
                          isForced: true
                        });
                      }}
                    >
                      Force Delete
                    </Button>
                  </Tooltip>
                )}
              </div>
              <div className="flex items-center space-x-4 border-l border-mineshaft-600 px-3 py-3">
                <ProjectPermissionCan
                  I={ProjectPermissionDynamicSecretActions.EditRootCredential}
                  a={subject(ProjectPermissionSub.DynamicSecrets, { environment, secretPath })}
                  renderTooltip
                  allowedLabel="Edit"
                >
                  {(isAllowed) => (
                    <IconButton
                      ariaLabel="edit-dynamic-secret"
                      variant="plain"
                      size="sm"
                      className="p-0 opacity-0 group-hover:opacity-100"
                      onClick={(evt) => {
                        evt.stopPropagation();
                        handlePopUpOpen("updateDynamicSecret", secret);
                      }}
                      isDisabled={!isAllowed || isRevoking}
                    >
                      <FontAwesomeIcon icon={faPencilSquare} size="lg" />
                    </IconButton>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionDynamicSecretActions.DeleteRootCredential}
                  a={subject(ProjectPermissionSub.DynamicSecrets, { environment, secretPath })}
                  renderTooltip
                  allowedLabel="Delete"
                >
                  {(isAllowed) => (
                    <IconButton
                      ariaLabel="delete-dynamic-secret"
                      variant="plain"
                      size="md"
                      className="p-0 opacity-0 group-hover:opacity-100"
                      onClick={(evt) => {
                        evt.stopPropagation();
                        handlePopUpOpen("deleteDynamicSecret", secret);
                      }}
                      isDisabled={!isAllowed || isRevoking}
                    >
                      <FontAwesomeIcon icon={faClose} size="lg" />
                    </IconButton>
                  )}
                </ProjectPermissionCan>
              </div>
            </div>
            <ModalContent
              title="Dynamic secret leases"
              subTitle="Revoke or renew your secret leases"
              className="max-w-3xl"
            >
              <DynamicSecretLease
                onClickNewLease={() => handlePopUpOpen("createDynamicSecretLease", secret)}
                onClose={() => handlePopUpClose("dynamicSecretLeases")}
                projectSlug={projectSlug}
                key={secret.id}
                dynamicSecretName={secret.name}
                secretPath={secretPath}
                environment={environment}
              />
            </ModalContent>
          </Modal>
        );
      })}
      <Modal
        isOpen={popUp.createDynamicSecretLease.isOpen}
        onOpenChange={(state) => handlePopUpToggle("createDynamicSecretLease", state)}
      >
        <ModalContent title="Provision lease">
          <CreateDynamicSecretLease
            provider={
              (popUp.createDynamicSecretLease?.data as { type: DynamicSecretProviders })?.type
            }
            onClose={() => handlePopUpClose("createDynamicSecretLease")}
            projectSlug={projectSlug}
            dynamicSecretName={(popUp.createDynamicSecretLease?.data as { name: string })?.name}
            secretPath={secretPath}
            environment={environment}
          />
        </ModalContent>
      </Modal>
      <Modal
        isOpen={popUp.updateDynamicSecret.isOpen}
        onOpenChange={(state) => handlePopUpToggle("updateDynamicSecret", state)}
      >
        <ModalContent title="Edit dynamic secret" className="max-w-3xl">
          <EditDynamicSecretForm
            onClose={() => handlePopUpClose("updateDynamicSecret")}
            projectSlug={projectSlug}
            dynamicSecretName={(popUp.updateDynamicSecret?.data as TDynamicSecret)?.name}
            secretPath={secretPath}
            environment={environment}
          />
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.deleteDynamicSecret.isOpen}
        deleteKey={(popUp.deleteDynamicSecret?.data as TDynamicSecret)?.name}
        title={
          (popUp.deleteDynamicSecret?.data as { isForced?: boolean })?.isForced
            ? "Do you want to force delete this dynamic secret?"
            : "Do you want to delete this dynamic secret?"
        }
        onChange={(isOpen) => handlePopUpToggle("deleteDynamicSecret", isOpen)}
        onDeleteApproved={handleDynamicSecretDelete}
      />
    </>
  );
};
