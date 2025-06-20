import { subject } from "@casl/ability";
import {
  faClose,
  faFileContract,
  faRepeat,
  faTrash,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format, formatDistance } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  IconButton,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TBody,
  Td,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { ProjectPermissionDynamicSecretActions, ProjectPermissionSub } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useGetDynamicSecretLeases, useRevokeDynamicSecretLease } from "@app/hooks/api";
import { DynamicSecretProviders, TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { DynamicSecretLeaseStatus } from "@app/hooks/api/dynamicSecretLease/types";

import { RenewDynamicSecretLease } from "./RenewDynamicSecretLease";

type Props = {
  dynamicSecret: TDynamicSecret;
  dynamicSecretName: string;
  projectSlug: string;
  environment: string;
  secretPath: string;
  onClickNewLease: () => void;
  onClose: () => void;
};

const DYNAMIC_SECRETS_WITHOUT_RENEWAL = [DynamicSecretProviders.Github];

export const DynamicSecretLease = ({
  projectSlug,
  dynamicSecretName,
  environment,
  secretPath,
  onClickNewLease,
  onClose,
  dynamicSecret
}: Props) => {
  const { handlePopUpOpen, popUp, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteSecret",
    "renewSecret"
  ] as const);
  const { data: leases, isPending: isLeaseLoading } = useGetDynamicSecretLeases({
    projectSlug,
    environmentSlug: environment,
    path: secretPath,
    dynamicSecretName
  });

  const deleteDynamicSecretLease = useRevokeDynamicSecretLease();

  const handleDynamicSecretDeleteLease = async () => {
    try {
      const { leaseId, isForced } = popUp.deleteSecret.data as {
        leaseId: string;
        isForced?: boolean;
      };
      await deleteDynamicSecretLease.mutateAsync({
        environmentSlug: environment,
        projectSlug,
        path: secretPath,
        dynamicSecretName,
        leaseId,
        isForced
      });
      handlePopUpClose("deleteSecret");
      createNotification({
        type: "success",
        text: "Successfully deleted lease"
      });
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to delete lease"
      });
    }
  };

  const canRenew = !DYNAMIC_SECRETS_WITHOUT_RENEWAL.includes(dynamicSecret.type);

  return (
    <div>
      <TableContainer>
        <Table className="bg-mineshaft-600">
          <THead>
            <Tr>
              <Td>Lease ID</Td>
              <Td>Expire At</Td>
              <Td />
            </Tr>
          </THead>
          <TBody>
            {!isLeaseLoading && leases?.length === 0 && (
              <tr>
                <td colSpan={3}>
                  <EmptyState title="No leases found" icon={faFileContract}>
                    <Button
                      onClick={onClickNewLease}
                      className="mt-4"
                      colorSchema="primary"
                      size="sm"
                    >
                      New Lease
                    </Button>
                  </EmptyState>
                </td>
              </tr>
            )}
            {(leases || []).map(({ id, expireAt, status, statusDetails }) => (
              <Tr key={id}>
                <Td>
                  {id}
                  {Boolean(status) && (
                    <Tooltip content={statusDetails || status || ""}>
                      <FontAwesomeIcon className="ml-2 text-yellow-600" icon={faWarning} />
                    </Tooltip>
                  )}
                </Td>
                <Td>
                  <Tooltip content={format(new Date(expireAt), "yyyy-MM-dd, hh:mm aaa")}>
                    <span className="capitalize">
                      {formatDistance(new Date(expireAt), new Date())}
                    </span>
                  </Tooltip>
                </Td>
                <Td>
                  <div className="flex items-center space-x-4">
                    {canRenew && (
                      <ProjectPermissionCan
                        I={ProjectPermissionDynamicSecretActions.Lease}
                        a={subject(ProjectPermissionSub.DynamicSecrets, {
                          environment,
                          secretPath,
                          metadata: dynamicSecret.metadata
                        })}
                        renderTooltip
                        allowedLabel="Renew"
                      >
                        {(isAllowed) => (
                          <IconButton
                            ariaLabel="renew-lease"
                            variant="plain"
                            size="sm"
                            className="p-0"
                            isDisabled={!isAllowed}
                            onClick={() => handlePopUpOpen("renewSecret", { leaseId: id })}
                          >
                            <FontAwesomeIcon icon={faRepeat} size="lg" />
                          </IconButton>
                        )}
                      </ProjectPermissionCan>
                    )}
                    <ProjectPermissionCan
                      I={ProjectPermissionDynamicSecretActions.Lease}
                      a={subject(ProjectPermissionSub.DynamicSecrets, {
                        environment,
                        secretPath,
                        metadata: dynamicSecret.metadata
                      })}
                      renderTooltip
                      allowedLabel="Delete"
                    >
                      {(isAllowed) => (
                        <IconButton
                          ariaLabel="delete-folder"
                          variant="plain"
                          size="md"
                          className="p-0"
                          isDisabled={!isAllowed}
                          onClick={() => handlePopUpOpen("deleteSecret", { leaseId: id })}
                        >
                          <FontAwesomeIcon icon={faClose} size="lg" />
                        </IconButton>
                      )}
                    </ProjectPermissionCan>
                    {status === DynamicSecretLeaseStatus.FailedDeletion && (
                      <ProjectPermissionCan
                        I={ProjectPermissionDynamicSecretActions.Lease}
                        a={subject(ProjectPermissionSub.DynamicSecrets, {
                          environment,
                          secretPath,
                          metadata: dynamicSecret.metadata
                        })}
                        renderTooltip
                        allowedLabel="Force Delete. This action will remove the secret from internal storage, but it will remain in external systems."
                      >
                        {(isAllowed) => (
                          <IconButton
                            ariaLabel="delete-folder"
                            variant="plain"
                            size="md"
                            className="p-0 text-red-600"
                            isDisabled={!isAllowed}
                            onClick={() =>
                              handlePopUpOpen("deleteSecret", { leaseId: id, isForced: true })
                            }
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </IconButton>
                        )}
                      </ProjectPermissionCan>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableContainer>
      {!isLeaseLoading && Boolean(leases?.length) && (
        <div className="mt-6 flex items-center space-x-4">
          <ProjectPermissionCan
            I={ProjectPermissionDynamicSecretActions.Lease}
            a={subject(ProjectPermissionSub.DynamicSecrets, {
              environment,
              secretPath,
              metadata: dynamicSecret.metadata
            })}
          >
            {(isAllowed) => (
              <Button onClick={onClickNewLease} size="xs" isDisabled={!isAllowed}>
                New Lease
              </Button>
            )}
          </ProjectPermissionCan>
          <Button onClick={onClose} variant="plain" colorSchema="secondary" size="xs">
            Close
          </Button>
        </div>
      )}
      <Modal
        isOpen={popUp.renewSecret.isOpen}
        onOpenChange={(state) => handlePopUpToggle("renewSecret", state)}
      >
        <ModalContent title="Renew Lease">
          <RenewDynamicSecretLease
            onClose={() => handlePopUpClose("renewSecret")}
            projectSlug={projectSlug}
            leaseId={(popUp.renewSecret?.data as { leaseId: string })?.leaseId}
            dynamicSecretName={dynamicSecretName}
            dynamicSecret={dynamicSecret}
            secretPath={secretPath}
            environment={environment}
          />
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.deleteSecret.isOpen}
        deleteKey="delete"
        title="Do you want to delete this lease?"
        onChange={(isOpen) => handlePopUpToggle("deleteSecret", isOpen)}
        onDeleteApproved={handleDynamicSecretDeleteLease}
      />
    </div>
  );
};
