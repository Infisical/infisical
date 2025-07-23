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
import { useDeleteSshCa, useGetSshCaById } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { SshCaModal } from "../SshCasPage/components/SshCaModal";
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
        to: "/projects/ssh/$projectId/overview",
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
          </PageHeader>
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
        title="Are you sure you want to remove the SSH CA from the project?"
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
