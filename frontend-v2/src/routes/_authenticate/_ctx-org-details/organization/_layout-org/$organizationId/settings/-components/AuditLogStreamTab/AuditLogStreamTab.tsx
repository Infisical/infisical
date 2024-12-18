import { faPlug, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  THead,
  Tr
} from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useDeleteAuditLogStream, useGetAuditLogStreams } from "@app/hooks/api";

import { AuditLogStreamForm } from "./AuditLogStreamForm";

export const AuditLogStreamsTab = withPermission(
  () => {
    const { currentOrg } = useOrganization();
    const orgId = currentOrg?.id || "";
    const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
      "auditLogStreamForm",
      "deleteAuditLogStream",
      "upgradePlan"
    ] as const);
    const { subscription } = useSubscription();

    const { data: auditLogStreams, isPending: isAuditLogStreamsLoading } =
      useGetAuditLogStreams(orgId);

    // mutation
    const { mutateAsync: deleteAuditLogStream } = useDeleteAuditLogStream();

    const handleAuditLogStreamDelete = async () => {
      try {
        const auditLogStreamId = popUp?.deleteAuditLogStream?.data as string;
        await deleteAuditLogStream({
          id: auditLogStreamId,
          orgId
        });
        handlePopUpClose("deleteAuditLogStream");
        createNotification({
          type: "success",
          text: "Successfully deleted stream"
        });
      } catch (err) {
        console.log(err);
        createNotification({
          type: "error",
          text: "Failed to delete stream"
        });
      }
    };

    return (
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="flex justify-between">
          <p className="text-xl font-semibold text-mineshaft-100">Audit Log Streams</p>
          <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Settings}>
            {(isAllowed) => (
              <Button
                onClick={() => {
                  if (subscription && !subscription?.auditLogStreams) {
                    handlePopUpOpen("upgradePlan");
                    return;
                  }
                  handlePopUpOpen("auditLogStreamForm");
                }}
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                isDisabled={!isAllowed}
              >
                Create
              </Button>
            )}
          </OrgPermissionCan>
        </div>
        <p className="mb-8 text-gray-400">
          Send audit logs from Infisical to external logging providers via HTTP
        </p>
        <div>
          <TableContainer>
            <Table>
              <THead>
                <Tr>
                  <Td>URL</Td>
                  <Td className="text-right">Action</Td>
                </Tr>
              </THead>
              <TBody>
                {isAuditLogStreamsLoading && (
                  <TableSkeleton columns={2} innerKey="stream-loading" />
                )}
                {!isAuditLogStreamsLoading && auditLogStreams && auditLogStreams?.length === 0 && (
                  <Tr>
                    <Td colSpan={5}>
                      <EmptyState title="No audit log streams found" icon={faPlug} />
                    </Td>
                  </Tr>
                )}
                {!isAuditLogStreamsLoading &&
                  auditLogStreams?.map(({ id, url }) => (
                    <Tr key={id}>
                      <Td className="max-w-xs overflow-hidden text-ellipsis hover:overflow-auto hover:break-all">
                        {url}
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end space-x-2">
                          <OrgPermissionCan
                            I={OrgPermissionActions.Edit}
                            a={OrgPermissionSubjects.Settings}
                          >
                            {(isAllowed) => (
                              <Button
                                variant="outline_bg"
                                size="xs"
                                isDisabled={!isAllowed}
                                onClick={() => handlePopUpOpen("auditLogStreamForm", id)}
                              >
                                Edit
                              </Button>
                            )}
                          </OrgPermissionCan>
                          <OrgPermissionCan
                            I={OrgPermissionActions.Delete}
                            a={OrgPermissionSubjects.Settings}
                          >
                            {(isAllowed) => (
                              <Button
                                variant="outline_bg"
                                className="border-red-800 bg-red-800 hover:border-red-700 hover:bg-red-700"
                                colorSchema="danger"
                                size="xs"
                                isDisabled={!isAllowed}
                                onClick={() => handlePopUpOpen("deleteAuditLogStream", id)}
                              >
                                Delete
                              </Button>
                            )}
                          </OrgPermissionCan>
                        </div>
                      </Td>
                    </Tr>
                  ))}
              </TBody>
            </Table>
          </TableContainer>
        </div>
        <Modal
          isOpen={popUp.auditLogStreamForm.isOpen}
          onOpenChange={(isModalOpen) => {
            handlePopUpToggle("auditLogStreamForm", isModalOpen);
          }}
        >
          <ModalContent
            title={`${popUp?.auditLogStreamForm?.data ? "Update" : "Create"} Audit Log Stream `}
            subTitle="Continuously stream logs from Infisical to third-party logging providers."
          >
            <AuditLogStreamForm
              id={popUp?.auditLogStreamForm?.data as string}
              onClose={() => handlePopUpToggle("auditLogStreamForm")}
            />
          </ModalContent>
        </Modal>
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="You can add audit log streams if you switch to Infisical's Enterprise  plan."
        />
        <DeleteActionModal
          isOpen={popUp.deleteAuditLogStream.isOpen}
          deleteKey="delete"
          title="Are you sure you want to remove this stream?"
          onChange={(isOpen) => handlePopUpToggle("deleteAuditLogStream", isOpen)}
          onClose={() => handlePopUpClose("deleteAuditLogStream")}
          onDeleteApproved={handleAuditLogStreamDelete}
        />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Settings }
);
