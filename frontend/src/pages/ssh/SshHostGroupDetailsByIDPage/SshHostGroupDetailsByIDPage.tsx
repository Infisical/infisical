import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
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
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { useDeleteSshHostGroup, useGetSshHostGroupById } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { SshHostGroupModal } from "../SshHostsPage/components/SshHostGroupModal";
import { SshHostGroupDetailsSection, SshHostGroupHostsSection } from "./components";

const Page = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const projectId = currentProject?.id || "";
  const sshHostGroupId = useParams({
    from: ROUTE_PATHS.Ssh.SshHostGroupDetailsByIDPage.id,
    select: (el) => el.sshHostGroupId
  });
  const { data } = useGetSshHostGroupById(sshHostGroupId);

  const { mutateAsync: deleteSshHostGroup } = useDeleteSshHostGroup();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "sshHostGroup",
    "deleteSshHostGroup"
  ] as const);

  const onRemoveSshGroupSubmit = async (groupIdToDelete: string) => {
    if (!projectId) return;

    await deleteSshHostGroup({ sshHostGroupId: groupIdToDelete });

    createNotification({
      text: "Successfully deleted SSH group",
      type: "success"
    });

    handlePopUpClose("deleteSshHostGroup");
    navigate({
      to: "/organizations/$orgId/projects/ssh/$projectId/overview",
      params: {
        orgId: currentOrg.id,
        projectId
      }
    });
  };

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {data && (
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <Link
            to="/organizations/$orgId/projects/ssh/$projectId/overview"
            params={{
              orgId: currentOrg.id,
              projectId
            }}
            className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
            Hosts
          </Link>
          <PageHeader scope={ProjectType.SSH} title={data.name} description="Configure SSH Group">
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
                  a={ProjectPermissionSub.SshHostGroups}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      className={twMerge(
                        isAllowed
                          ? "hover:bg-red-500! hover:text-white!"
                          : "pointer-events-none cursor-not-allowed opacity-50"
                      )}
                      onClick={() =>
                        handlePopUpOpen("deleteSshHostGroup", {
                          groupId: data.id,
                          name: data.name
                        })
                      }
                      disabled={!isAllowed}
                    >
                      Delete SSH Group
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </PageHeader>
          <div className="flex">
            <div className="mr-4 w-96">
              <SshHostGroupDetailsSection
                sshHostGroupId={sshHostGroupId}
                handlePopUpOpen={handlePopUpOpen}
              />
            </div>
            <div className="w-full">
              <SshHostGroupHostsSection sshHostGroupId={sshHostGroupId} />
            </div>
          </div>
        </div>
      )}
      <SshHostGroupModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteSshHostGroup.isOpen}
        title={`Are you sure you want to remove the SSH group: ${
          (popUp?.deleteSshHostGroup?.data as { name: string })?.name || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteSshHostGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveSshGroupSubmit((popUp?.deleteSshHostGroup?.data as { groupId: string })?.groupId)
        }
      />
    </div>
  );
};

export const SshHostGroupDetailsByIDPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "SSH Group" })}</title>
      </Helmet>
      <ProjectPermissionCan
        I={ProjectPermissionActions.Read}
        a={ProjectPermissionSub.SshHostGroups}
        passThrough={false}
        renderGuardBanner
      >
        <Page />
      </ProjectPermissionCan>
    </>
  );
};
