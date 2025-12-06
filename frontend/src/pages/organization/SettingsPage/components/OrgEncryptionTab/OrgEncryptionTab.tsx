import { faLock, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  EmptyState,
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
import { useGetExternalKmsList, useRemoveExternalKms } from "@app/hooks/api";

import { AddExternalKmsForm } from "./AddExternalKmsForm";
import { ExternalKmsItem } from "./ExternalKmsItem";
import { UpdateExternalKmsForm } from "./UpdateExternalKmsForm";

export const OrgEncryptionTab = withPermission(
  () => {
    const { currentOrg, isSubOrganization } = useOrganization();
    const { subscription } = useSubscription();
    const orgId = currentOrg?.id || "";
    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "upgradePlan",
      "addExternalKms",
      "editExternalKms",
      "removeExternalKms"
    ] as const);
    const { data: externalKmsList, isPending: isExternalKmsListLoading } =
      useGetExternalKmsList(orgId);

    const { mutateAsync: removeExternalKms } = useRemoveExternalKms(currentOrg.id);

    const handleRemoveExternalKms = async () => {
      const { kmsId } = popUp?.removeExternalKms?.data as {
        kmsId: string;
      };

      await removeExternalKms(kmsId);

      createNotification({
        text: "Successfully deleted external KMS",
        type: "success"
      });

      handlePopUpToggle("removeExternalKms", false);
    };

    return (
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="flex justify-between">
          <p className="text-xl font-medium text-mineshaft-100">Key Management System (KMS)</p>
          <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Kms}>
            {(isAllowed) => (
              <Button
                onClick={() => {
                  if (subscription && !subscription?.externalKms) {
                    handlePopUpOpen("upgradePlan", {
                      isEnterpriseFeature: true
                    });
                    return;
                  }
                  handlePopUpOpen("addExternalKms");
                }}
                isDisabled={!isAllowed}
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
              >
                Add
              </Button>
            )}
          </OrgPermissionCan>
        </div>
        <p className="mb-4 text-gray-400">
          Encrypt your {isSubOrganization ? "sub-" : ""}organization&apos;s data with external KMS.
        </p>
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Td>Provider</Td>
                <Td>Alias</Td>
                <Td>ID</Td>
              </Tr>
            </THead>
            <TBody>
              {isExternalKmsListLoading && <TableSkeleton columns={2} innerKey="kms-loading" />}
              {!isExternalKmsListLoading && externalKmsList && externalKmsList?.length === 0 && (
                <Tr>
                  <Td colSpan={5}>
                    <EmptyState title="No external KMS found" icon={faLock} />
                  </Td>
                </Tr>
              )}
              {!isExternalKmsListLoading &&
                externalKmsList?.map((kms) => (
                  <ExternalKmsItem
                    key={kms.id}
                    kms={kms}
                    handlePopUpOpen={handlePopUpOpen}
                    subscription={subscription}
                  />
                ))}
            </TBody>
          </Table>
        </TableContainer>
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="Your current plan does not include access to external KMS. To unlock this feature, please upgrade to Infisical Enterprise plan."
          isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
        />
        <AddExternalKmsForm
          isOpen={popUp.addExternalKms.isOpen}
          onToggle={(state) => handlePopUpToggle("addExternalKms", state)}
        />
        <UpdateExternalKmsForm
          isOpen={popUp.editExternalKms.isOpen}
          kmsId={(popUp.editExternalKms.data as { kmsId: string })?.kmsId}
          onOpenChange={(state) => handlePopUpToggle("editExternalKms", state)}
        />
        <DeleteActionModal
          isOpen={popUp.removeExternalKms.isOpen}
          title={`Are you sure you want to remove ${
            (popUp?.removeExternalKms?.data as { slug: string })?.slug || ""
          } from ${(popUp?.removeExternalKms?.data as { provider: string })?.provider || ""}?`}
          onChange={(isOpen) => handlePopUpToggle("removeExternalKms", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={handleRemoveExternalKms}
        />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Kms }
);
