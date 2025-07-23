import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faCopy, faEllipsisV } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PageHeader
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useDeleteOrgRole, useGetOrgRole } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";
import { DuplicateOrgRoleModal } from "@app/pages/organization/RoleByIDPage/components/DuplicateOrgRoleModal";
import { OrgAccessControlTabSections } from "@app/types/org";

import { RoleModal, RolePermissionsSection } from "./components";

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
                <DropdownMenuTrigger asChild>
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
                  <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Role}>
                    {(isAllowed) => (
                      <DropdownMenuItem
                        onClick={() => {
                          handlePopUpOpen("role", {
                            roleId
                          });
                        }}
                        isDisabled={!isAllowed}
                      >
                        Edit Role
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                  <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Role}>
                    {(isAllowed) => (
                      <DropdownMenuItem
                        onClick={() => {
                          handlePopUpOpen("duplicateRole");
                        }}
                        isDisabled={!isAllowed}
                      >
                        Duplicate Role
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                  <OrgPermissionCan I={OrgPermissionActions.Delete} a={OrgPermissionSubjects.Role}>
                    {(isAllowed) => (
                      <DropdownMenuItem
                        onClick={() => {
                          handlePopUpOpen("deleteOrgRole");
                        }}
                        isDisabled={!isAllowed}
                      >
                        Delete Role
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </PageHeader>
          <RolePermissionsSection roleId={roleId} />
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
