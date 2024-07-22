/* eslint-disable @typescript-eslint/no-unused-vars */
import { useRouter } from "next/router";
import { faChevronLeft, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
  Tooltip
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { withPermission } from "@app/hoc";
import { useDeleteOrgRole, useGetOrgRole } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { RoleDetailsSection, RoleModal, RolePermissionsSection } from "./components";

export const RolePage = withPermission(
  () => {
    const router = useRouter();
    const roleId = router.query.roleId as string;
    const { currentOrg } = useOrganization();
    const orgId = currentOrg?.id || "";
    const { data } = useGetOrgRole(orgId, roleId);
    const { mutateAsync: deleteOrgRole } = useDeleteOrgRole();

    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "role",
      "deleteOrgRole"
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
        router.push(`/org/${orgId}/members`);
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
          <div className="mx-auto mb-6 w-full max-w-7xl py-6 px-6">
            <Button
              variant="link"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
              onClick={() => {
                router.push(`/org/${orgId}/members`);
              }}
              className="mb-4"
            >
              Roles
            </Button>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-3xl font-semibold text-white">{data.name}</p>
              {isCustomRole && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild className="rounded-lg">
                    <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                      <Tooltip content="More options">
                        <FontAwesomeIcon size="sm" icon={faEllipsis} />
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
                    <OrgPermissionCan
                      I={OrgPermissionActions.Delete}
                      a={OrgPermissionSubjects.Role}
                    >
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
            </div>
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
          title={`Are you sure want to delete the organization role ${data?.name ?? ""}?`}
          onChange={(isOpen) => handlePopUpToggle("deleteOrgRole", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={() => onDeleteOrgRoleSubmit()}
        />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Role }
);
