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
import { CaType, useDeleteCa, useGetCa } from "@app/hooks/api";
import { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { CaInstallCertModal } from "../CertificateAuthoritiesPage/components/CaInstallCertModal";
import { CaModal } from "../CertificateAuthoritiesPage/components/CaModal";
import {
  CaCertificatesSection,
  CaCrlsSection,
  CaDetailsSection,
  CaRenewalModal
} from "./components";

const Page = () => {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const params = useParams({
    from: ROUTE_PATHS.CertManager.CertAuthDetailsByIDPage.id
  });
  const { caName } = params as { caName: string };
  const { data } = useGetCa({
    caName,
    projectId: currentWorkspace?.id || "",
    type: CaType.INTERNAL
  }) as { data: TInternalCertificateAuthority };

  const projectId = currentWorkspace?.id || "";

  const { mutateAsync: deleteCa } = useDeleteCa();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "ca",
    "deleteCa",
    "installCaCert",
    "renewCa"
  ] as const);

  const onRemoveCaSubmit = async () => {
    try {
      if (!currentWorkspace?.slug) return;

      await deleteCa({
        caName,
        projectId: currentWorkspace.id,
        type: CaType.INTERNAL
      });

      createNotification({
        text: "Successfully deleted CA",
        type: "success"
      });

      handlePopUpClose("deleteCa");
      navigate({
        to: `/projects/$projectId/${ProjectType.CertificateManager}/certificate-authorities` as const,
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
          <PageHeader title={data.name}>
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
                      onClick={() => handlePopUpOpen("deleteCa")}
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
              <CaDetailsSection caName={data.name} handlePopUpOpen={handlePopUpOpen} />
            </div>
            <div className="w-full">
              <CaCertificatesSection caId={data.id} />
              <CaCrlsSection caId={data.id} />
            </div>
          </div>
        </div>
      )}
      <CaModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CaRenewalModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CaInstallCertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteCa.isOpen}
        title={`Are you sure you want to remove the CA ${
          (popUp?.deleteCa?.data as { dn: string })?.dn || ""
        } from the project?`}
        subTitle="This action will delete other CAs and certificates below it in your CA hierarchy."
        onChange={(isOpen) => handlePopUpToggle("deleteCa", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={onRemoveCaSubmit}
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
