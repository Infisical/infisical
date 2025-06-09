import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { SshCaStatus, useDeleteSshCa, useUpdateSshCa } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { SshCaModal } from "./SshCaModal";
import { SshCaTable } from "./SshCaTable";

export const SshCaSection = () => {
  const { mutateAsync: deleteSshCa } = useDeleteSshCa();
  const { mutateAsync: updateSshCa } = useUpdateSshCa();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "sshCa",
    "deleteSshCa",
    "sshCaStatus", // enable / disable
    "upgradePlan"
  ] as const);

  const onRemoveSshCaSubmit = async (caId: string) => {
    try {
      await deleteSshCa({ caId });

      createNotification({
        text: "Successfully deleted SSH CA",
        type: "success"
      });

      handlePopUpClose("deleteSshCa");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete SSH CA",
        type: "error"
      });
    }
  };

  const onUpdateSshCaStatus = async ({ caId, status }: { caId: string; status: SshCaStatus }) => {
    try {
      await updateSshCa({ caId, status });

      createNotification({
        text: `Successfully ${status === SshCaStatus.ACTIVE ? "enabled" : "disabled"} SSH CA`,
        type: "success"
      });

      handlePopUpClose("sshCaStatus");
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${status === SshCaStatus.ACTIVE ? "enabled" : "disabled"} SSH CA`,
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Certificate Authorities</p>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.SshCertificateAuthorities}
        >
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("sshCa")}
              isDisabled={!isAllowed}
            >
              Create SSH CA
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <SshCaTable handlePopUpOpen={handlePopUpOpen} />
      <SshCaModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteSshCa.isOpen}
        title="Are you sure you want to remove the SSH CA?"
        onChange={(isOpen) => handlePopUpToggle("deleteSshCa", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveSshCaSubmit((popUp?.deleteSshCa?.data as { caId: string })?.caId)
        }
      />
      <DeleteActionModal
        isOpen={popUp.sshCaStatus.isOpen}
        title={`Are you sure you want to ${
          (popUp?.sshCaStatus?.data as { status: string })?.status === SshCaStatus.ACTIVE
            ? "enable"
            : "disable"
        } the CA?`}
        subTitle={
          (popUp?.sshCaStatus?.data as { status: string })?.status === SshCaStatus.ACTIVE
            ? "This action will allow the SSH CA to start issuing certificates again."
            : "This action will prevent the SSH CA from issuing new certificates."
        }
        onChange={(isOpen) => handlePopUpToggle("sshCaStatus", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onUpdateSshCaStatus(popUp?.sshCaStatus?.data as { caId: string; status: SshCaStatus })
        }
      />
      {/* <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      /> */}
    </div>
  );
};
