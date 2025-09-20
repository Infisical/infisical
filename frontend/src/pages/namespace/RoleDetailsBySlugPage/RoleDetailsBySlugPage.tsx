import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faCopy, faEllipsisV } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { NamespacePermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PageHeader
} from "@app/components/v2";
import {
  NamespacePermissionActions,
  NamespacePermissionSubjects
} from "@app/context/NamespacePermissionContext/types";
import { useNamespace } from "@app/context";
import { useDeleteNamespaceRole, namespaceRolesQueryKeys } from "@app/hooks/api/namespaceRoles";
import { usePopUp } from "@app/hooks/usePopUp";

import {
  DuplicateNamespaceRoleModal,
  NamespaceRoleModal,
  RolePermissionsSection
} from "./components";

export const Page = () => {
  const navigate = useNavigate();
  const { roleSlug } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organization/namespaces/$namespaceName/_namespace-layout/roles/$roleSlug",
    select: (el) => ({ roleSlug: el.roleSlug })
  });
  const { namespaceName } = useNamespace();

  const { data } = useQuery(namespaceRolesQueryKeys.detail({ namespaceName, roleSlug }));

  const { mutateAsync: deleteNamespaceRole } = useDeleteNamespaceRole();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "role",
    "deleteNamespaceRole",
    "duplicateRole"
  ] as const);

  const onDeleteNamespaceRoleSubmit = async () => {
    try {
      if (!namespaceName || !data?.id) return;

      await deleteNamespaceRole({
        namespaceName,
        roleId: data.id
      });

      createNotification({
        text: "Successfully deleted namespace role",
        type: "success"
      });

      handlePopUpClose("deleteNamespaceRole");
      navigate({
        to: "/organization/namespaces/$namespaceName/access-management" as const,
        params: {
          namespaceName
        }
      });
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to delete namespace role";

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
                  <NamespacePermissionCan
                    I={NamespacePermissionActions.Edit}
                    a={NamespacePermissionSubjects.Role}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        onClick={() => {
                          handlePopUpOpen("role", {
                            roleSlug
                          });
                        }}
                        isDisabled={!isAllowed}
                      >
                        Edit Role
                      </DropdownMenuItem>
                    )}
                  </NamespacePermissionCan>
                  <NamespacePermissionCan
                    I={NamespacePermissionActions.Create}
                    a={NamespacePermissionSubjects.Role}
                  >
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
                  </NamespacePermissionCan>
                  <NamespacePermissionCan
                    I={NamespacePermissionActions.Delete}
                    a={NamespacePermissionSubjects.Role}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        onClick={() => {
                          handlePopUpOpen("deleteNamespaceRole");
                        }}
                        isDisabled={!isAllowed}
                      >
                        Delete Role
                      </DropdownMenuItem>
                    )}
                  </NamespacePermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </PageHeader>
          <RolePermissionsSection roleSlug={roleSlug} />
        </div>
      )}
      <NamespaceRoleModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteNamespaceRole.isOpen}
        title={`Are you sure you want to delete the namespace role ${data?.name ?? ""}?`}
        onChange={(isOpen) => handlePopUpToggle("deleteNamespaceRole", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => onDeleteNamespaceRoleSubmit()}
      />
      <DuplicateNamespaceRoleModal
        isOpen={popUp.duplicateRole.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("duplicateRole", isOpen)}
        roleSlug={roleSlug}
      />
    </div>
  );
};

export const RoleBySlugPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "Namespace Role" })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <NamespacePermissionCan
        passThrough={false}
        renderGuardBanner
        I={NamespacePermissionActions.Read}
        a={NamespacePermissionSubjects.Role}
      >
        <Page />
      </NamespacePermissionCan>
    </>
  );
};
