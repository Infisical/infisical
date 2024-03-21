import { subject } from "@casl/ability";
import { faClose, faFileContract, faInfoCircle, faRepeat } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format, formatDistance } from "date-fns";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
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
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useGetDynamicSecretLeases, useRevokeDynamicSecretLease } from "@app/hooks/api";

import { RenewDynamicSecretLease } from "./RenewDynamicSecretLease";

type Props = {
  slug: string;
  projectId: string;
  environment: string;
  secretPath: string;
  onClickNewLease: () => void;
  onClose: () => void;
};

export const DynamicSecretLease = ({
  projectId,
  slug,
  environment,
  secretPath,
  onClickNewLease,
  onClose
}: Props) => {
  const { handlePopUpOpen, popUp, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteSecret",
    "renewSecret"
  ] as const);
  const { data: leases, isLoading: isLeaseLoading } = useGetDynamicSecretLeases({
    projectId,
    environment,
    path: secretPath,
    slug
  });
  const { createNotification } = useNotificationContext();

  const deleteDynamicSecretLease = useRevokeDynamicSecretLease();

  const handleDynamicSecretDeleteLease = async () => {
    try {
      const { leaseId } = popUp.deleteSecret.data as { leaseId: string };
      await deleteDynamicSecretLease.mutateAsync({
        environment,
        projectId,
        path: secretPath,
        slug,
        leaseId
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
                      <FontAwesomeIcon
                        className="relative bottom-2 left-1 text-red-600"
                        icon={faInfoCircle}
                      />
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
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
                      renderTooltip
                      allowedLabel="Renew"
                    >
                      {(isAllowed) => (
                        <IconButton
                          ariaLabel="edit-folder"
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
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Delete}
                      a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
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
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableContainer>
      {!isLeaseLoading && Boolean(leases?.length) && (
        <div className="mt-6 flex items-center space-x-4">
          <Button onClick={onClickNewLease} size="xs">
            New Lease
          </Button>
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
            projectId={projectId}
            leaseId={(popUp.renewSecret?.data as { leaseId: string })?.leaseId}
            slug={slug}
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
