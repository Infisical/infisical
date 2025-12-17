import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub,
  useProject
} from "@app/context";
import { CaStatus, CaType, useDeleteCa, useUpdateCa } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { CaCertModal } from "./CaCertModal";
import { CaInstallCertModal } from "./CaInstallCertModal";
import { CaModal } from "./CaModal";
import { CaTable } from "./CaTable";

export const CaSection = () => {
  const { currentProject } = useProject();
  const { mutateAsync: deleteCa } = useDeleteCa();
  const { mutateAsync: updateCa } = useUpdateCa();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "ca",
    "caCert",
    "installCaCert",
    "deleteCa",
    "caStatus" // enable / disable
  ] as const);

  const onRemoveCaSubmit = async (id: string) => {
    if (!currentProject?.slug) return;

    await deleteCa({ id, projectId: currentProject.id, type: CaType.INTERNAL });

    createNotification({
      text: "Successfully deleted CA",
      type: "success"
    });

    handlePopUpClose("deleteCa");
  };

  const onUpdateCaStatus = async ({ caId, status }: { caId: string; status: CaStatus }) => {
    if (!currentProject?.slug) return;

    await updateCa({ id: caId, type: CaType.INTERNAL, status });

    createNotification({
      text: `Successfully ${status === CaStatus.ACTIVE ? "enabled" : "disabled"} CA`,
      type: "success"
    });

    handlePopUpClose("caStatus");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <div className="flex items-center gap-x-2">
          <p className="text-xl font-medium text-mineshaft-100">Internal Certificate Authorities</p>
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pki/private-ca" />
        </div>
        <ProjectPermissionCan
          I={ProjectPermissionCertificateAuthorityActions.Create}
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
        title={`Are you sure you want to remove the CA ${(popUp?.deleteCa?.data as { dn: string })?.dn || ""
          } from the project?`}
        subTitle="This action will delete other CAs and certificates below it in your CA hierarchy."
        onChange={(isOpen) => handlePopUpToggle("deleteCa", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => onRemoveCaSubmit((popUp?.deleteCa?.data as { caId: string })?.caId)}
      />
      <DeleteActionModal
        isOpen={popUp.caStatus.isOpen}
        title={`Are you sure you want to ${(popUp?.caStatus?.data as { status: string })?.status === CaStatus.ACTIVE
            ? "enable"
            : "disable"
          } the CA ${(popUp?.caStatus?.data as { dn: string })?.dn || ""} from the project?`}
        subTitle={
          (popUp?.caStatus?.data as { status: string })?.status === CaStatus.ACTIVE
            ? "This action will allow the CA to start issuing certificates again."
            : "This action will prevent the CA from issuing new certificates."
        }
        onChange={(isOpen) => handlePopUpToggle("caStatus", isOpen)}
        buttonText="Confirm"
        deleteKey="confirm"
        onDeleteApproved={() =>
          onUpdateCaStatus(popUp?.caStatus?.data as { caId: string; status: CaStatus })
        }
      />
    </div>
  );
};
