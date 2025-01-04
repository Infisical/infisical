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
import { useDeleteSshCa, useGetSshCaById } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { SshCaModal } from "../OverviewPage/components/SshCaModal";
import { SshCaDetailsSection, SshCertificateTemplatesSection } from "./components";

const Page = () => {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const projectId = currentWorkspace?.id || "";
  const caId = useParams({
    from: ROUTE_PATHS.Ssh.SshCaByIDPage.id,
    select: (el) => el.caId
  });
  const { data } = useGetSshCaById(caId);

  const { mutateAsync: deleteSshCa } = useDeleteSshCa();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "sshCa",
    "deleteSshCa"
  ] as const);

  const onRemoveCaSubmit = async (caIdToDelete: string) => {
    try {
      if (!projectId) return;

      await deleteSshCa({ caId: caIdToDelete });

      createNotification({
        text: "Successfully deleted SSH CA",
        type: "success"
      });

      handlePopUpClose("deleteSshCa");
      navigate({
        to: `/${ProjectType.SSH}/$projectId/overview` as const,
        params: {
          projectId
        }
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete SSH CA",
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
                to: `/${ProjectType.SSH}/$projectId/overview`,
                params: {
                  projectId
                }
              })
            }
            className="mb-4"
          >
            SSH Certificate Authorities
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
                  a={ProjectPermissionSub.SshCertificateAuthorities}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      className={twMerge(
                        isAllowed
                          ? "hover:!bg-red-500 hover:!text-white"
                          : "pointer-events-none cursor-not-allowed opacity-50"
                      )}
                      onClick={() =>
                        handlePopUpOpen("deleteSshCa", {
                          caId: data.id
                        })
                      }
                      disabled={!isAllowed}
                    >
                      Delete SSH CA
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex">
            <div className="mr-4 w-96">
              <SshCaDetailsSection caId={caId} handlePopUpOpen={handlePopUpOpen} />
            </div>
            <div className="w-full">
              <SshCertificateTemplatesSection caId={caId} />
            </div>
          </div>
        </div>
      )}
      <SshCaModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteSshCa.isOpen}
        title="Are you sure want to remove the SSH CA from the project?"
        onChange={(isOpen) => handlePopUpToggle("deleteSshCa", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveCaSubmit((popUp?.deleteSshCa?.data as { caId: string })?.caId)
        }
      />
    </div>
  );
};

export const SshCaByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>SSH Certificate Authority</title>
      </Helmet>
      <ProjectPermissionCan
        I={ProjectPermissionActions.Read}
        a={ProjectPermissionSub.SshCertificateAuthorities}
        passThrough={false}
        renderGuardBanner
      >
        <Page />
      </ProjectPermissionCan>
    </>
  );
};
