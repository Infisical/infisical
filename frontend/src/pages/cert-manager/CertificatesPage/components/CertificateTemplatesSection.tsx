/**
 * TODO (dangtony98): Reevaluate if this component should be in main
 * CertificateTab or under CA page in the future.
 */
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  CertificateEnrollmentUpgradeIntent,
  useUpgradeGate
} from "@app/components/license/UpgradeGate";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton } from "@app/components/v2";
import {
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionSub,
  useProject
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteCertTemplate } from "@app/hooks/api";

import { CertificateTemplateEnrollmentModal } from "./CertificateTemplateEnrollmentModal";
import { CertificateTemplateModal } from "./CertificateTemplateModal";
import { CertificateTemplatesTable } from "./CertificateTemplatesTable";

type Props = {
  caId: string;
};

export const CertificateTemplatesSection = ({ caId }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "certificateTemplate",
    "deleteCertificateTemplate",
    "enrollmentOptions"
  ] as const);
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  const { currentProject } = useProject();
  const { mutateAsync: deleteCertTemplate } = useDeleteCertTemplate();

  const onRemoveCertificateTemplateSubmit = async (id: string) => {
    if (!currentProject?.id) {
      return;
    }

    await deleteCertTemplate({
      id,
      projectId: currentProject.id
    });

    createNotification({
      text: "Successfully deleted certificate template",
      type: "success"
    });

    handlePopUpClose("deleteCertificateTemplate");
  };

  return (
    <div className="border-border-control bg-surface-base mt-4 rounded-lg border p-4">
      <div className="border-border-emphasis flex items-center justify-between border-b pb-4">
        <h3 className="text-foreground text-lg font-medium">Certificate Templates</h3>
        <ProjectPermissionCan
          I={ProjectPermissionPkiTemplateActions.Create}
          a={ProjectPermissionSub.CertificateTemplates}
        >
          {(isAllowed) => (
            <IconButton
              ariaLabel="copy icon"
              variant="plain"
              className="group relative"
              onClick={() => handlePopUpOpen("certificateTemplate")}
              isDisabled={!isAllowed}
            >
              <FontAwesomeIcon icon={faPlus} />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="py-4">
        <CertificateTemplatesTable
          handlePopUpOpen={handlePopUpOpen}
          caId={caId}
          onEnrollmentUpgrade={(certificateTemplateId) =>
            openUpgradeGate({
              intent: CertificateEnrollmentUpgradeIntent,
              paywallKey: "cert-manager.certificate-templates",
              isEntitled: (refreshedSubscription) => refreshedSubscription.pkiEst,
              onGranted: () => handlePopUpOpen("enrollmentOptions", { id: certificateTemplateId }),
              failureMessage: "Failed to refresh your subscription. Try managing enrollment again."
            })
          }
        />
      </div>
      <CertificateTemplateModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} caId={caId} />
      <CertificateTemplateEnrollmentModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteCertificateTemplate.isOpen}
        title={`Are you sure you want to delete the certificate template ${
          (popUp?.deleteCertificateTemplate?.data as { name: string })?.name || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteCertificateTemplate", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveCertificateTemplateSubmit(
            (popUp?.deleteCertificateTemplate?.data as { id: string })?.id
          )
        }
      />
      {upgradeGate}
    </div>
  );
};
