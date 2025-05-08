import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
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
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useDeleteProjectRole, useGetProjectRoleBySlug } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { usePopUp } from "@app/hooks/usePopUp";
import { ProjectAccessControlTabs } from "@app/types/project";

import { RoleDetailsSection } from "./components/RoleDetailsSection";
import { RoleModal } from "./components/RoleModal";
import { RolePermissionsSection } from "./components/RolePermissionsSection";

const Page = () => {
  const navigate = useNavigate();
  const roleSlug = useParams({
    strict: false,
    select: (el) => el.roleSlug as string
  });
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data } = useGetProjectRoleBySlug(projectId, roleSlug as string);

  const { mutateAsync: deleteProjectRole } = useDeleteProjectRole();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "role",
    "deleteRole"
  ] as const);

  const onDeleteRoleSubmit = async () => {
    try {
      if (!currentWorkspace?.slug || !data?.id) return;

      await deleteProjectRole({
        projectId,
        id: data.id
      });

      createNotification({
        text: "Successfully deleted project role",
        type: "success"
      });
      handlePopUpClose("deleteRole");
      navigate({
        to: `/${currentWorkspace?.type}/$projectId/access-management` as const,
        params: {
          projectId
        },
        search: {
          selectedTab: ProjectAccessControlTabs.Roles
        }
      });
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to delete project role";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  const isCustomRole = !Object.values(ProjectMembershipRole).includes(
    (data?.slug ?? "") as ProjectMembershipRole
  );

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {data && (
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader title={data.name}>
            {isCustomRole && (
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
                    I={ProjectPermissionActions.Edit}
                    a={ProjectPermissionSub.Role}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        className={twMerge(
                          !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={() =>
                          handlePopUpOpen("role", {
                            roleSlug
                          })
                        }
                        disabled={!isAllowed}
                      >
                        Edit Role
                      </DropdownMenuItem>
                    )}
                  </ProjectPermissionCan>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Delete}
                    a={ProjectPermissionSub.Role}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        className={twMerge(
                          isAllowed
                            ? "hover:!bg-red-500 hover:!text-white"
                            : "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={() => handlePopUpOpen("deleteRole")}
                        disabled={!isAllowed}
                      >
                        Delete Role
                      </DropdownMenuItem>
                    )}
                  </ProjectPermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </PageHeader>
          <div className="flex">
            <div className="mr-4 w-96">
              <RoleDetailsSection roleSlug={roleSlug} handlePopUpOpen={handlePopUpOpen} />
            </div>
            <RolePermissionsSection roleSlug={roleSlug} isDisabled={!isCustomRole} />
          </div>
        </div>
      )}
      <RoleModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteRole.isOpen}
        title={`Are you sure want to delete the project role ${data?.name ?? ""}?`}
        onChange={(isOpen) => handlePopUpToggle("deleteRole", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => onDeleteRoleSubmit()}
      />
    </div>
  );
};

export const RoleDetailsBySlugPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "Project Settings" })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <ProjectPermissionCan
        I={ProjectPermissionActions.Read}
        a={ProjectPermissionSub.Role}
        renderGuardBanner
        passThrough={false}
      >
        <Page />
      </ProjectPermissionCan>
    </>
  );
};
