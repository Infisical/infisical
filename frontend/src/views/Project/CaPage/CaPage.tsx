/* eslint-disable @typescript-eslint/no-unused-vars */
import { useRouter } from "next/router";
import { faChevronLeft, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { useDeleteCa, useGetCaById } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";
import { CaModal } from "@app/views/Project/CertificatesPage/components/CaTab/components/CaModal";

import { CaInstallCertModal } from "../CertificatesPage/components/CaTab/components/CaInstallCertModal";
import { CertificateTemplatesSection } from "../CertificatesPage/components/CertificatesTab/components/CertificateTemplatesSection";
import {
  CaCertificatesSection,
  CaCrlsSection,
  CaDetailsSection,
  CaRenewalModal
} from "./components";

export const CaPage = withProjectPermission(
  () => {
    const router = useRouter();
    const caId = router.query.caId as string;
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

        await createNotification({
          text: "Successfully deleted CA",
          type: "success"
        });

        handlePopUpClose("deleteCa");
        router.push(`/project/${projectId}/certificates`);
      } catch (err) {
        console.error(err);
        createNotification({
          text: "Failed to delete CA",
          type: "error"
        });
      }
    };

    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        {data && (
          <div className="mx-auto mb-6 w-full max-w-7xl py-6 px-6">
            <Button
              variant="link"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
              onClick={() => router.push(`/project/${projectId}/certificates`)}
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
          onDeleteApproved={() =>
            onRemoveCaSubmit((popUp?.deleteCa?.data as { caId: string })?.caId)
          }
        />
      </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.CertificateAuthorities }
);
