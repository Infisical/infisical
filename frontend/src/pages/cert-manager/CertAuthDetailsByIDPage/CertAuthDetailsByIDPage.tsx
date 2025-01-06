import { Helmet } from "react-helmet";
import { faChevronLeft, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useDeleteCa, useGetCaById } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { CaInstallCertModal } from "../CertificatesPage/components/CaTab/components/CaInstallCertModal";
import { CaModal } from "../CertificatesPage/components/CaTab/components/CaModal";
import { CertificateTemplatesSection } from "../CertificatesPage/components/CertificatesTab/components/CertificateTemplatesSection";
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
        <div className="mx-auto mb-6 w-full max-w-7xl px-6 py-6">
          <Button
            variant="link"
            type="submit"
            leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
            onClick={() =>
              navigate({
                to: `/${ProjectType.CertificateManager}/$projectId/overview` as const,
                params: {
                  projectId
                }
              })
            }
            className="mb-4"
          >
            Certificate Authorities
          </Button>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-3xl font-semibold text-white">{data.friendlyName}</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="rounded-lg">
                <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                  <Tooltip content="More options">
                    <FontAwesomeIcon size="sm" icon={faEllipsis} />
                  </Tooltip>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="p-1">
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
          </div>
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
