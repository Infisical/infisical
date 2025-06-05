import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { CaStatus, CaType, useDeleteCa, useUpdateCa } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { CaCertModal } from "./CaCertModal";
import { CaInstallCertModal } from "./CaInstallCertModal";
import { CaModal } from "./CaModal";
import { CaTable } from "./CaTable";

export const CaSection = () => {
  const { currentWorkspace } = useWorkspace();
  const { mutateAsync: deleteCa } = useDeleteCa();
  const { mutateAsync: updateCa } = useUpdateCa();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "ca",
    "caCert",
    "installCaCert",
    "deleteCa",
    "caStatus", // enable / disable
    "upgradePlan"
  ] as const);

  const onRemoveCaSubmit = async (caName: string) => {
    try {
      if (!currentWorkspace?.slug) return;

      await deleteCa({ caName, projectId: currentWorkspace.id, type: CaType.INTERNAL });

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

  const onUpdateCaStatus = async ({ caName, status }: { caName: string; status: CaStatus }) => {
    try {
      if (!currentWorkspace?.slug) return;

      await updateCa({ caName, projectId: currentWorkspace.id, type: CaType.INTERNAL, status });

      createNotification({
        text: `Successfully ${status === CaStatus.ACTIVE ? "enabled" : "disabled"} CA`,
        type: "success"
      });

      handlePopUpClose("caStatus");
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${status === CaStatus.ACTIVE ? "enabled" : "disabled"} CA`,
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Internal Certificate Authorities</p>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.CertificateAuthorities}
        >
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("ca")}
              isDisabled={!isAllowed}
            >
              Create CA
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <CaModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CaInstallCertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CaCertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CaTable handlePopUpOpen={handlePopUpOpen} />
      <DeleteActionModal
        isOpen={popUp.deleteCa.isOpen}
        title={`Are you sure you want to remove the CA ${
          (popUp?.deleteCa?.data as { dn: string })?.dn || ""
        } from the project?`}
        subTitle="This action will delete other CAs and certificates below it in your CA hierarchy."
        onChange={(isOpen) => handlePopUpToggle("deleteCa", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveCaSubmit((popUp?.deleteCa?.data as { caName: string })?.caName)
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
        deleteKey="confirm"
        onDeleteApproved={() =>
          onUpdateCaStatus(popUp?.caStatus?.data as { caName: string; status: CaStatus })
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
