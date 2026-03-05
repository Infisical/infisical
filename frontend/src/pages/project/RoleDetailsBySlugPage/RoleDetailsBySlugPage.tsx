import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, CopyIcon, EllipsisIcon, PencilIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, PageHeader } from "@app/components/v2";
import {
  Button,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
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
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const projectId = currentProject?.id || "";
  const orgId = currentOrg?.id || "";

  const { data } = useGetProjectRoleBySlug(projectId, roleSlug as string);

  const { mutateAsync: deleteProjectRole } = useDeleteProjectRole();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "role",
    "deleteRole",
    "duplicateRole"
  ] as const);

  const onDeleteRoleSubmit = async () => {
    if (!currentProject?.slug || !data?.id) return;

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
      to: `${getProjectBaseURL(currentProject.type)}/access-management` as const,
      params: {
        projectId,
        orgId
      },
      search: {
        selectedTab: ProjectAccessControlTabs.Roles
      }
    });
  };

  const isCustomRole = !Object.values(ProjectMembershipRole).includes(
    (data?.slug ?? "") as ProjectMembershipRole
  );

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-foreground">
      {data && (
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <Link
            to={`${getProjectBaseURL(currentProject.type)}/access-management`}
            params={{
              projectId,
              orgId
            }}
            search={{
              selectedTab: ProjectAccessControlTabs.Roles
            }}
            className="mb-4 flex items-center gap-x-2 text-sm text-muted"
          >
            <ChevronLeftIcon className="size-4" />
            Project Roles
          </Link>
          <PageHeader
            scope={currentProject.type}
            title={data.name}
            description={
              <>
                {data.slug} {data.description && `- ${data.description}`}
              </>
            }
          >
            {isCustomRole && (
              <UnstableDropdownMenu>
                <UnstableDropdownMenuTrigger asChild>
                  <Button variant="outline">
                    Options
                    <EllipsisIcon />
                  </Button>
                </UnstableDropdownMenuTrigger>
                <UnstableDropdownMenuContent align="end">
                  <UnstableDropdownMenuItem
                    onClick={() => {
                      navigator.clipboard.writeText(data.id);
                      createNotification({
                        text: "Copied ID to clipboard",
                        type: "info"
                      });
                    }}
                  >
                    <CopyIcon />
                    Copy ID
                  </UnstableDropdownMenuItem>
                  <UnstableDropdownMenuItem
                    onClick={() => {
                      navigator.clipboard.writeText(data.slug);
                      createNotification({
                        text: "Copied slug to clipboard",
                        type: "info"
                      });
                    }}
                  >
                    <CopyIcon />
                    Copy Slug
                  </UnstableDropdownMenuItem>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Edit}
                    a={ProjectPermissionSub.Role}
                  >
                    {(isAllowed) => (
                      <UnstableDropdownMenuItem
                        className={twMerge(
                          !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={() =>
                          handlePopUpOpen("role", {
                            roleSlug
                          })
                        }
                        isDisabled={!isAllowed}
                      >
                        <PencilIcon />
                        Edit Role
                      </UnstableDropdownMenuItem>
                    )}
                  </ProjectPermissionCan>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Create}
                    a={ProjectPermissionSub.Role}
                  >
                    {(isAllowed) => (
                      <UnstableDropdownMenuItem
                        className={twMerge(
                          !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={() => {
                          handlePopUpOpen("duplicateRole");
                        }}
                        isDisabled={!isAllowed}
                      >
                        <CopyIcon />
                        Duplicate Role
                      </UnstableDropdownMenuItem>
                    )}
                  </ProjectPermissionCan>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Delete}
                    a={ProjectPermissionSub.Role}
                  >
                    {(isAllowed) => (
                      <UnstableDropdownMenuItem
                        variant="danger"
                        onClick={() => handlePopUpOpen("deleteRole")}
                        isDisabled={!isAllowed}
                      >
                        <TrashIcon />
                        Delete Role
                      </UnstableDropdownMenuItem>
                    )}
                  </ProjectPermissionCan>
                </UnstableDropdownMenuContent>
              </UnstableDropdownMenu>
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
