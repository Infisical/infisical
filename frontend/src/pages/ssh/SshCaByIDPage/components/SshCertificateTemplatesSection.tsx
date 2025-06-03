import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  SshCertTemplateStatus,
  useDeleteSshCertTemplate,
  useUpdateSshCertTemplate
} from "@app/hooks/api";

import { SshCertificateModal } from "./SshCertificateModal";
import { SshCertificateTemplateModal } from "./SshCertificateTemplateModal";
import { SshCertificateTemplatesTable } from "./SshCertificateTemplatesTable";

type Props = {
  caId: string;
};

export const SshCertificateTemplatesSection = ({ caId }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "sshCertificateTemplate",
    "sshCertificateTemplateStatus",
    "sshCertificate",
    "deleteSshCertificateTemplate",
    "upgradePlan"
  ] as const);

  const { mutateAsync: deleteSshCertTemplate } = useDeleteSshCertTemplate();
  const { mutateAsync: updateSshCertTemplate } = useUpdateSshCertTemplate();

  const onRemoveSshCertificateTemplateSubmit = async (id: string) => {
    try {
      await deleteSshCertTemplate({
        id
      });

      await createNotification({
        text: "Successfully deleted SSH certificate template",
        type: "success"
      });

      handlePopUpClose("deleteSshCertificateTemplate");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete SSH certificate template",
        type: "error"
      });
    }
  };

  const onUpdateSshCaStatus = async ({
    templateId,
    status
  }: {
    templateId: string;
    status: SshCertTemplateStatus;
  }) => {
    try {
      await updateSshCertTemplate({ id: templateId, status });

      await createNotification({
        text: `Successfully ${
          status === SshCertTemplateStatus.ACTIVE ? "enabled" : "disabled"
        } SSH certificate template`,
        type: "success"
      });

      handlePopUpClose("sshCertificateTemplateStatus");
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${
          status === SshCertTemplateStatus.ACTIVE ? "enabled" : "disabled"
        } SSH certificate template`,
        type: "error"
      });
    }
  };

  return (
    <div className="h-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Certificate Templates</h3>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.SshCertificateTemplates}
        >
          {(isAllowed) => (
            <IconButton
              ariaLabel="copy icon"
              variant="plain"
              className="group relative"
              onClick={() => handlePopUpOpen("sshCertificateTemplate")}
              isDisabled={!isAllowed}
            >
              <FontAwesomeIcon icon={faPlus} />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="py-4">
        <SshCertificateTemplatesTable handlePopUpOpen={handlePopUpOpen} sshCaId={caId} />
      </div>
      <SshCertificateModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <SshCertificateTemplateModal
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
        sshCaId={caId}
      />
      <DeleteActionModal
        isOpen={popUp.deleteSshCertificateTemplate.isOpen}
        title={`Are you sure you want to delete the SSH certificate template ${
          (popUp?.deleteSshCertificateTemplate?.data as { name: string })?.name || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteSshCertificateTemplate", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveSshCertificateTemplateSubmit(
            (popUp?.deleteSshCertificateTemplate?.data as { id: string })?.id
          )
        }
      />
      <DeleteActionModal
        isOpen={popUp.sshCertificateTemplateStatus.isOpen}
        title={`Are you sure you want to ${
          (popUp?.sshCertificateTemplateStatus?.data as { status: string })?.status ===
          SshCertTemplateStatus.ACTIVE
            ? "enable"
            : "disable"
        } this certificate template?`}
        subTitle={
          (popUp?.sshCertificateTemplateStatus?.data as { status: string })?.status ===
          SshCertTemplateStatus.ACTIVE
            ? "This action will allow certificate issuance under this template again."
            : "This action will prevent certificate issuance under this template."
        }
        onChange={(isOpen) => handlePopUpToggle("sshCertificateTemplateStatus", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onUpdateSshCaStatus(
            popUp?.sshCertificateTemplateStatus?.data as {
              templateId: string;
              status: SshCertTemplateStatus;
            }
          )
        }
        buttonText={
          (popUp?.sshCertificateTemplateStatus?.data as { status: string })?.status ===
          SshCertTemplateStatus.ACTIVE
            ? "Enable"
            : "Disable"
        }
      />
    </div>
  );
};
