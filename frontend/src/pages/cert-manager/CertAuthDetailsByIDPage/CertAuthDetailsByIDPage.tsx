import { Helmet } from "react-helmet";
import { subject } from "@casl/ability";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  AccessRestrictedBanner,
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
import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { CaType, useDeleteCa, useGetCa } from "@app/hooks/api";
import { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";
import { ProjectType } from "@app/hooks/api/projects/types";
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
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const params = useParams({
    from: ROUTE_PATHS.CertManager.CertAuthDetailsByIDPage.id
  });
  const { caId } = params as { caId: string };
  const { data } = useGetCa({
    caId,
    type: CaType.INTERNAL
  }) as { data: TInternalCertificateAuthority };

  const projectId = currentProject?.id || "";

  const { mutateAsync: deleteCa } = useDeleteCa();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "ca",
    "deleteCa",
    "installCaCert",
    "renewCa"
  ] as const);

  const onRemoveCaSubmit = async () => {
    if (!currentProject?.slug) return;

    await deleteCa({
      id: data.id,
      projectId: currentProject.id,
      type: CaType.INTERNAL
    });

    createNotification({
      text: "Successfully deleted CA",
      type: "success"
    });

    handlePopUpClose("deleteCa");
    navigate({
      to: "/organizations/$orgId/projects/cert-management/$projectId/certificate-authorities",
      params: {
        orgId: currentOrg.id,
        projectId
      }
    });
  };

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {data && (
        <ProjectPermissionCan
          I={ProjectPermissionCertificateAuthorityActions.Read}
          a={subject(ProjectPermissionSub.CertificateAuthorities, {
            caId: data.id,
            name: data.name
          })}
        >
          {(isAllowed) =>
            isAllowed ? (
              <div className="mx-auto mb-6 w-full max-w-8xl">
                <Link
                  to="/organizations/$orgId/projects/cert-management/$projectId/certificate-authorities"
                  params={{
                    orgId: currentOrg.id,
                    projectId
                  }}
                  className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
                >
                  <FontAwesomeIcon icon={faChevronLeft} />
                  Certificate Authorities
                </Link>
                <PageHeader
                  scope={ProjectType.CertificateManager}
                  description="Manage certificate authority"
                  title={data.name}
                >
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
                        I={ProjectPermissionCertificateAuthorityActions.Delete}
                        a={subject(ProjectPermissionSub.CertificateAuthorities, {
                          caId: data.id,
                          name: data.name
                        })}
                      >
                        {(canDelete) => (
                          <DropdownMenuItem
                            className={twMerge(
                              canDelete
                                ? "hover:bg-red-500! hover:text-white!"
                                : "pointer-events-none cursor-not-allowed opacity-50"
                            )}
                            onClick={() => handlePopUpOpen("deleteCa")}
                            disabled={!canDelete}
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
                    <CaDetailsSection caId={data.id} handlePopUpOpen={handlePopUpOpen} />
                  </div>
                  <div className="w-full">
                    <CaCertificatesSection caId={data.id} caName={data.name} />
                    <CaCrlsSection caId={data.id} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="container mx-auto flex h-full items-center justify-center">
                <AccessRestrictedBanner />
              </div>
            )
          }
        </ProjectPermissionCan>
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
