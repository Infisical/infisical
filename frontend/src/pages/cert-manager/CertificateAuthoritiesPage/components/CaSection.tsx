import { useState } from "react";
import { PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge
} from "@app/components/v3";
import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub,
  useProject
} from "@app/context";
import { CaStatus, CaType, useDeleteCa, useUpdateCa } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { PkiDocsUrls } from "../../pki-docs-urls";
import { CreateCaWizard } from "./CreateCaWizard/CreateCaWizard";
import { CaCertModal } from "./CaCertModal";
import { CaInstallCertModal } from "./CaInstallCertModal";
import { CaModal } from "./CaModal";
import { CaTable } from "./CaTable";

export const CaSection = () => {
  const { currentProject } = useProject();
  const { mutateAsync: deleteCa } = useDeleteCa();
  const { mutateAsync: updateCa } = useUpdateCa();
  const [isCreateWizardOpen, setIsCreateWizardOpen] = useState(false);

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "ca",
    "caCert",
    "installCaCert",
    "deleteCa",
    "caStatus" // enable / disable
  ] as const);

  const onRemoveCaSubmit = async (id: string) => {
    if (!currentProject?.slug) return;

    await deleteCa({ id, type: CaType.INTERNAL });

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
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>
          Internal Certificate Authorities
          <DocumentationLinkBadge href={PkiDocsUrls.ca.internal} />
        </CardTitle>
        <CardDescription>
          Private CAs hosted by Infisical. Use them to issue certificates directly or sign other CAs
          to build a layered setup.
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionCertificateAuthorityActions.Create}
            a={ProjectPermissionSub.CertificateAuthorities}
          >
            {(isAllowed) => (
              <Button
                variant="project"
                onClick={() => setIsCreateWizardOpen(true)}
                isDisabled={!isAllowed}
              >
                <PlusIcon />
                Create CA
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        <CaTable handlePopUpOpen={handlePopUpOpen} />
      </CardContent>
      <CreateCaWizard isOpen={isCreateWizardOpen} onOpenChange={setIsCreateWizardOpen} />
      <CaModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CaInstallCertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CaCertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteCa.isOpen}
        title={`Are you sure you want to remove the CA ${
          (popUp?.deleteCa?.data as { dn: string })?.dn || ""
        }?`}
        subTitle="This action will delete other CAs and certificates below it in your CA hierarchy."
        onChange={(isOpen) => handlePopUpToggle("deleteCa", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => onRemoveCaSubmit((popUp?.deleteCa?.data as { caId: string })?.caId)}
      />
      <DeleteActionModal
        isOpen={popUp.caStatus.isOpen}
        title={`Are you sure you want to ${
          (popUp?.caStatus?.data as { status: string })?.status === CaStatus.ACTIVE
            ? "enable"
            : "disable"
        } the CA ${(popUp?.caStatus?.data as { dn: string })?.dn || ""}?`}
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
    </Card>
  );
};
