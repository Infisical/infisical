import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { CaStatus, CaType, useDeleteCa, useUpdateCa } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { ExternalCaModal } from "./ExternalCaModal";
import { ExternalCaTable } from "./ExternalCaTable";

export const ExternalCaSection = () => {
  const { currentWorkspace } = useWorkspace();
  const { mutateAsync: deleteCa } = useDeleteCa();
  const { mutateAsync: updateCa } = useUpdateCa();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "ca",
    "deleteCa",
    "caStatus", // enable / disable
    "upgradePlan"
  ] as const);

  const onRemoveCaSubmit = async (caName: string, type: CaType) => {
    try {
      if (!currentWorkspace?.id) return;

      await deleteCa({ caName, type, projectId: currentWorkspace.id });

      createNotification({
        text: "Successfully deleted CA",
        type: "success"
      });

      handlePopUpClose("deleteCa");
    } catch {
      createNotification({
        text: "Failed to delete CA",
        type: "error"
      });
    }
  };

  const onUpdateCaStatus = async ({
    name,
    type,
    status
  }: {
    name: string;
    type: CaType;
    status: CaStatus;
  }) => {
    try {
      if (!currentWorkspace?.slug) return;

      await updateCa({ caName: name, type, status, projectId: currentWorkspace.id });

      createNotification({
        text: `Successfully ${status === CaStatus.ACTIVE ? "enabled" : "disabled"} CA`,
        type: "success"
      });

      handlePopUpClose("caStatus");
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${status === CaStatus.ACTIVE ? "enable" : "disable"} CA`,
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">External Certificate Authorities</p>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.CertificateAuthorities}
        >
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("ca")}
              isDisabled={!isAllowed}
            >
              Create CA
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <ExternalCaModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <ExternalCaTable handlePopUpOpen={handlePopUpOpen} />
      <DeleteActionModal
        isOpen={popUp.deleteCa.isOpen}
        title={`Are you sure you want to remove the CA ${
          (popUp?.deleteCa?.data as { dn: string })?.dn || ""
        } from the project?`}
        subTitle="This action will delete other CAs and certificates below it in your CA hierarchy."
        onChange={(isOpen) => handlePopUpToggle("deleteCa", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveCaSubmit(
            (popUp?.deleteCa?.data as { name: string })?.name,
            (popUp?.deleteCa?.data as { type: CaType })?.type
          )
        }
      />
      <DeleteActionModal
        isOpen={popUp.caStatus.isOpen}
        title={`Are you sure you want to ${
          (popUp?.caStatus?.data as { status: string })?.status === CaStatus.ACTIVE
            ? "enable"
            : "disable"
        } the CA ${(popUp?.caStatus?.data as { dn: string })?.dn || ""} from the project?`}
        subTitle={
          (popUp?.caStatus?.data as { status: string })?.status === CaStatus.ACTIVE
            ? "This action will allow the CA to start issuing certificates again."
            : "This action will prevent the CA from issuing new certificates."
        }
        onChange={(isOpen) => handlePopUpToggle("caStatus", isOpen)}
        buttonText="Proceed"
        deleteKey="confirm"
        onDeleteApproved={() =>
          onUpdateCaStatus(
            popUp?.caStatus?.data as { name: string; type: CaType; status: CaStatus }
          )
        }
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      />
    </div>
  );
};
