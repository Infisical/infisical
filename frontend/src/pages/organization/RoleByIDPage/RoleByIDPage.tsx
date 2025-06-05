import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
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
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useDeleteOrgRole, useGetOrgRole } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";
import { DuplicateOrgRoleModal } from "@app/pages/organization/RoleByIDPage/components/DuplicateOrgRoleModal";
import { OrgAccessControlTabSections } from "@app/types/org";

import { RoleDetailsSection, RoleModal, RolePermissionsSection } from "./components";

export const Page = () => {
  const navigate = useNavigate();
  const params = useParams({
    from: ROUTE_PATHS.Organization.RoleByIDPage.id
  });
  const roleId = params.roleId as string;
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { data } = useGetOrgRole(orgId, roleId);
  const { mutateAsync: deleteOrgRole } = useDeleteOrgRole();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "role",
    "deleteOrgRole",
    "duplicateRole"
  ] as const);

  const onDeleteOrgRoleSubmit = async () => {
    try {
      if (!orgId || !roleId) return;

      await deleteOrgRole({
        orgId,
        id: roleId
      });

      createNotification({
        text: "Successfully deleted organization role",
        type: "success"
      });

      handlePopUpClose("deleteOrgRole");
      navigate({
        to: "/organization/access-management" as const,
        search: {
          selectedTab: OrgAccessControlTabSections.Roles
        }
      });
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to delete organization role";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  const isCustomRole = !["admin", "member", "no-access"].includes(data?.slug ?? "");

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
                <DropdownMenuContent align="start" className="p-1">
                  <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Role}>
                    {(isAllowed) => (
                      <DropdownMenuItem
                        className={twMerge(
                          !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={async () => {
                          handlePopUpOpen("role", {
                            roleId
                          });
                        }}
                        disabled={!isAllowed}
                      >
                        Edit Role
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                  <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Role}>
                    {(isAllowed) => (
                      <DropdownMenuItem
                        className={twMerge(
                          !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={() => {
                          handlePopUpOpen("duplicateRole");
                        }}
                        disabled={!isAllowed}
                      >
                        Duplicate Role
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                  <OrgPermissionCan I={OrgPermissionActions.Delete} a={OrgPermissionSubjects.Role}>
                    {(isAllowed) => (
                      <DropdownMenuItem
                        className={twMerge(
                          isAllowed
                            ? "hover:!bg-red-500 hover:!text-white"
                            : "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={async () => {
                          handlePopUpOpen("deleteOrgRole");
                        }}
                        disabled={!isAllowed}
                      >
                        Delete Role
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </PageHeader>
          <div className="flex">
            <div className="mr-4 w-96">
              <RoleDetailsSection roleId={roleId} handlePopUpOpen={handlePopUpOpen} />
            </div>
            <RolePermissionsSection roleId={roleId} />
          </div>
        </div>
      )}
      <RoleModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteOrgRole.isOpen}
        title={`Are you sure you want to delete the organization role ${data?.name ?? ""}?`}
        onChange={(isOpen) => handlePopUpToggle("deleteOrgRole", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => onDeleteOrgRoleSubmit()}
      />
      <DuplicateOrgRoleModal
        isOpen={popUp.duplicateRole.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("duplicateRole", isOpen)}
        roleId={data?.id}
      />
    </div>
  );
};

export const RoleByIDPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <OrgPermissionCan
        passThrough={false}
        renderGuardBanner
        I={OrgPermissionActions.Read}
        a={OrgPermissionSubjects.Role}
      >
        <Page />
      </OrgPermissionCan>
    </>
  );
};
