import { Helmet } from "react-helmet";
import { useNavigate, useParams } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PageHeader,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useDeleteCa, useGetCaById } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { CaInstallCertModal } from "../CertificateAuthoritiesPage/components/CaInstallCertModal";
import { CaModal } from "../CertificateAuthoritiesPage/components/CaModal";
import { CertificateTemplatesSection } from "../CertificatesPage/components/CertificateTemplatesSection";
import {
  CaCertificatesSection,
  CaCrlsSection,
  CaDetailsSection,
  CaRenewalModal
} from "./components";

const Page = () => {
  const navigate = useNavigate();
  const params = useParams({
    from: ROUTE_PATHS.CertManager.CertAuthDetailsByIDPage.id
  });
  const caId = params.caId as string;
  const { data } = useGetCaById(caId);

  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { mutateAsync: deleteCa } = useDeleteCa();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "ca",
    "deleteCa",
    "installCaCert",
    "renewCa"
  ] as const);

  const onRemoveCaSubmit = async (caIdToDelete: string) => {
    try {
      if (!currentWorkspace?.slug) return;

      await deleteCa({ caId: caIdToDelete, projectSlug: currentWorkspace.slug });

      createNotification({
        text: "Successfully deleted CA",
        type: "success"
      });

      handlePopUpClose("deleteCa");
      navigate({
        to: `/${ProjectType.CertificateManager}/$projectId/overview` as const,
        params: {
          projectId
        }
      });
    } catch {
      createNotification({
        text: "Failed to delete CA",
        type: "error"
      });
    }
  };

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {data && (
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader title={data.friendlyName}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="rounded-lg">
                <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                  <Tooltip content="More options">
                    <Button variant="outline_bg">More</Button>
                  </Tooltip>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="p-1">
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Delete}
                  a={ProjectPermissionSub.CertificateAuthorities}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      className={twMerge(
                        isAllowed
                          ? "hover:!bg-red-500 hover:!text-white"
                          : "pointer-events-none cursor-not-allowed opacity-50"
                      )}
                      onClick={() =>
                        handlePopUpOpen("deleteCa", {
                          caId: data.id,
                          dn: data.dn
                        })
                      }
                      disabled={!isAllowed}
                    >
                      Delete CA
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </PageHeader>
          <div className="flex">
            <div className="mr-4 w-96">
              <CaDetailsSection caId={caId} handlePopUpOpen={handlePopUpOpen} />
            </div>
            <div className="w-full">
              <CaCertificatesSection caId={caId} />
              <CertificateTemplatesSection caId={caId} />
              <CaCrlsSection caId={caId} />
            </div>
          </div>
        </div>
      )}
      <CaModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CaRenewalModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CaInstallCertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteCa.isOpen}
        title={`Are you sure want to remove the CA ${
          (popUp?.deleteCa?.data as { dn: string })?.dn || ""
        } from the project?`}
        subTitle="This action will delete other CAs and certificates below it in your CA hierarchy."
        onChange={(isOpen) => handlePopUpToggle("deleteCa", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => onRemoveCaSubmit((popUp?.deleteCa?.data as { caId: string })?.caId)}
      />
    </div>
  );
};

export const CertAuthDetailsByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>Certificate Authority</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <Page />
    </>
  );
};
