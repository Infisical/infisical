import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, CopyIcon, EllipsisIcon, PencilIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, PageHeader } from "@app/components/v2";
import {
  Button,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger
} from "@app/components/v3";
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
  const { currentOrg, isSubOrganization } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { data } = useGetOrgRole(orgId, roleId);
  const { mutateAsync: deleteOrgRole } = useDeleteOrgRole();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "role",
    "deleteOrgRole",
    "duplicateRole"
  ] as const);

  const onDeleteOrgRoleSubmit = async () => {
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
      to: "/organizations/$orgId/access-management" as const,
      params: { orgId },
      search: {
        selectedTab: OrgAccessControlTabSections.Roles
      }
    });
  };

  const isCustomRole = !["admin", "member", "no-access"].includes(data?.slug ?? "");

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {data && (
        <div className="mx-auto w-full max-w-8xl">
          <Link
            to="/organizations/$orgId/access-management"
            params={{ orgId }}
            search={{
              selectedTab: OrgAccessControlTabSections.Roles
            }}
            className="mb-4 flex items-center gap-x-2 text-sm text-muted"
          >
            <ChevronLeftIcon className="size-4" />
            Roles
          </Link>
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
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
                  <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Role}>
                    {(isAllowed) => (
                      <UnstableDropdownMenuItem
                        className={twMerge(
                          !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={() => {
                          handlePopUpOpen("role", {
                            roleId
                          });
                        }}
                        isDisabled={!isAllowed}
                      >
                        <PencilIcon />
                        Edit Role
                      </UnstableDropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                  <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Role}>
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
                  </OrgPermissionCan>
                  <OrgPermissionCan I={OrgPermissionActions.Delete} a={OrgPermissionSubjects.Role}>
                    {(isAllowed) => (
                      <UnstableDropdownMenuItem
                        variant="danger"
                        onClick={() => {
                          handlePopUpOpen("deleteOrgRole");
                        }}
                        isDisabled={!isAllowed}
                      >
                        <TrashIcon />
                        Delete Role
                      </UnstableDropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                </UnstableDropdownMenuContent>
              </UnstableDropdownMenu>
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
