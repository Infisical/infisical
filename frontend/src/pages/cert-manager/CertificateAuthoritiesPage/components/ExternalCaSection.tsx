import { PlusIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
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
import { CaStatus, CaType, useDeleteCa, useGetCaQuota, useUpdateCa } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { PkiDocsUrls } from "../../pki-docs-urls";
import { ExternalCaModal } from "./ExternalCaModal";
import { ExternalCaTable } from "./ExternalCaTable";

export const ExternalCaSection = () => {
  const { currentProject } = useProject();
  const { mutateAsync: deleteCa } = useDeleteCa();
  const { mutateAsync: updateCa } = useUpdateCa();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "ca",
    "deleteCa",
    "caStatus", // enable / disable
    "upgradePlan"
  ] as const);

  // maxCas covers every CA type, so an external CA is capped the same way an internal one is.
  // maxInternalCas is deliberately not consulted here: it caps INTERNAL only.
  const { data: caQuota } = useGetCaQuota();
  const caLimit = caQuota?.certificateAuthorities;
  const isAtCaLimit = typeof caLimit?.limit === "number" && caLimit.used >= caLimit.limit;

  const handleCreateCa = () => {
    if (isAtCaLimit) {
      handlePopUpOpen("upgradePlan", {
        text: `Your plan includes ${caLimit.limit} certificate ${caLimit.limit === 1 ? "authority" : "authorities"}. Your organization is using ${caLimit.used}. Upgrade to add more.`
      });
      return;
    }
    handlePopUpOpen("ca");
  };

  const onRemoveCaSubmit = async (id: string, type: CaType) => {
    if (!currentProject?.id) return;

    await deleteCa({ id, type });

    createNotification({
      text: "Successfully deleted CA",
      type: "success"
    });

    handlePopUpClose("deleteCa");
  };

  const onUpdateCaStatus = async ({
    caId,
    type,
    status
  }: {
    caId: string;
    type: CaType;
    status: CaStatus;
  }) => {
    if (!currentProject?.slug) return;

    await updateCa({ id: caId, type, status });

    createNotification({
      text: `Successfully ${status === CaStatus.ACTIVE ? "enabled" : "disabled"} CA`,
      type: "success"
    });

    handlePopUpClose("caStatus");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          External Certificate Authorities
          <DocumentationLinkBadge href={PkiDocsUrls.ca.external} />
        </CardTitle>
        <CardDescription>
          Third-party CAs connected to Infisical. Use them to issue certificates from providers you
          already have.
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionCertificateAuthorityActions.Create}
            a={ProjectPermissionSub.CertificateAuthorities}
          >
            {(isAllowed) => (
              <Button variant="project" onClick={handleCreateCa} isDisabled={!isAllowed}>
                <PlusIcon />
                Create External CA
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ExternalCaTable handlePopUpOpen={handlePopUpOpen} />
      </CardContent>
      <ExternalCaModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteCa.isOpen}
        title={`Are you sure you want to remove the CA ${
          (popUp?.deleteCa?.data as { dn: string })?.dn || ""
        }?`}
        subTitle="This action will delete other CAs and certificates below it in your CA hierarchy."
        onChange={(isOpen) => handlePopUpToggle("deleteCa", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveCaSubmit(
            (popUp?.deleteCa?.data as { caId: string })?.caId,
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
        } the CA ${(popUp?.caStatus?.data as { dn: string })?.dn || ""}?`}
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
            popUp?.caStatus?.data as { caId: string; type: CaType; status: CaStatus }
          )
        }
      />

      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { text: string })?.text}
      />
    </Card>
  );
};
