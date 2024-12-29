import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";

import { SshCertificateModal } from "../../SshCaByIDPage/components/SshCertificateModal";
import { SshCertificatesTable } from "./SshCertificatesTable";

export const SshCertificatesSection = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["sshCertificate"] as const);
  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Certificates</p>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.SshCertificates}
        >
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("sshCertificate")}
              isDisabled={!isAllowed}
            >
              Request
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <SshCertificatesTable />
      <SshCertificateModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </div>
  );
};
