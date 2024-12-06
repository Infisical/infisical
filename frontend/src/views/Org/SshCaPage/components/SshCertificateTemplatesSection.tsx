import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteSshCertTemplate } from "@app/hooks/api";

import { SshCertificateModal } from "./SshCertificateModal";
import { SshCertificateTemplateModal } from "./SshCertificateTemplateModal";
import { SshCertificateTemplatesTable } from "./SshCertificateTemplatesTable";

type Props = {
  caId: string;
};

export const SshCertificateTemplatesSection = ({ caId }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "sshCertificateTemplate",
    "sshCertificate",
    "deleteSshCertificateTemplate",
    "upgradePlan"
  ] as const);

  const { mutateAsync: deleteSshCertTemplate } = useDeleteSshCertTemplate();

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

  return (
    <div className="h-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Certificate Templates</h3>
        <OrgPermissionCan
          I={OrgPermissionActions.Create}
          a={OrgPermissionSubjects.SshCertificateTemplates}
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
        </OrgPermissionCan>
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
        title={`Are you sure want to delete the SSH certificate template ${
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
    </div>
  );
};
