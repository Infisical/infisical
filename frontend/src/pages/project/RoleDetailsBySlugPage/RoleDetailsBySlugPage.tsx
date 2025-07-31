import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faCopy, faEdit, faEllipsisV, faTrash } from "@fortawesome/free-solid-svg-icons";
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
  PageHeader
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { useDeleteProjectRole, useGetProjectRoleBySlug } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { usePopUp } from "@app/hooks/usePopUp";
import { DuplicateProjectRoleModal } from "@app/pages/project/RoleDetailsBySlugPage/components/DuplicateProjectRoleModal";
import { RolePermissionsSection } from "@app/pages/project/RoleDetailsBySlugPage/components/RolePermissionsSection";
import { ProjectAccessControlTabs } from "@app/types/project";

import { RoleModal } from "./components/RoleModal";

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
    "deleteRole",
    "duplicateRole"
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
        to: `${getProjectBaseURL(currentWorkspace.type)}/access-management` as const,
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
          <PageHeader
            title={
              <div className="flex flex-col">
                <div>
                  <span>{data.name}</span>
                  <p className="text-sm font-[400] normal-case leading-3 text-mineshaft-400">
                    {data.slug} {data.description && `- ${data.description}`}
                  </p>
                </div>
              </div>
            }
          >
            {isCustomRole && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="rounded-lg">
                  <Button
                    colorSchema="secondary"
                    rightIcon={<FontAwesomeIcon icon={faEllipsisV} className="ml-2" />}
                  >
                    Options
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={2} className="p-1">
                  <DropdownMenuItem
                    onClick={() => {
                      navigator.clipboard.writeText(data.id);

                      createNotification({
                        text: "Copied ID to clipboard",
                        type: "info"
                      });
                    }}
                    icon={<FontAwesomeIcon icon={faCopy} />}
                  >
                    Copy ID
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      navigator.clipboard.writeText(data.slug);

                      createNotification({
                        text: "Copied slug to clipboard",
                        type: "info"
                      });
                    }}
                    icon={<FontAwesomeIcon icon={faCopy} />}
                  >
                    Copy Slug
                  </DropdownMenuItem>
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
                        icon={<FontAwesomeIcon icon={faEdit} />}
                        disabled={!isAllowed}
                      >
                        Edit Role
                      </DropdownMenuItem>
                    )}
                  </ProjectPermissionCan>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Create}
                    a={ProjectPermissionSub.Role}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        className={twMerge(
                          !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        icon={<FontAwesomeIcon icon={faCopy} />}
                        onClick={() => {
                          handlePopUpOpen("duplicateRole");
                        }}
                        disabled={!isAllowed}
                      >
                        Duplicate Role
                      </DropdownMenuItem>
                    )}
                  </ProjectPermissionCan>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Delete}
                    a={ProjectPermissionSub.Role}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        icon={<FontAwesomeIcon icon={faTrash} />}
                        onClick={() => handlePopUpOpen("deleteRole")}
                        isDisabled={!isAllowed}
                      >
                        Delete Role
                      </DropdownMenuItem>
                    )}
                  </ProjectPermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </PageHeader>
          <RolePermissionsSection roleSlug={roleSlug} isDisabled={!isCustomRole} />
        </div>
      )}
      <RoleModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteRole.isOpen}
        title={`Are you sure you want to delete the project role ${data?.name ?? ""}?`}
        onChange={(isOpen) => handlePopUpToggle("deleteRole", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => onDeleteRoleSubmit()}
      />
      <DuplicateProjectRoleModal
        isOpen={popUp.duplicateRole.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("duplicateRole", isOpen)}
        roleSlug={roleSlug}
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
