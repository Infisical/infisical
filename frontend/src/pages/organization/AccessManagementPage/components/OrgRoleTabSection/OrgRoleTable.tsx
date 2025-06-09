import { faEllipsis, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { isCustomOrgRole } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";
import { useDeleteOrgRole, useGetOrgRoles, useUpdateOrg } from "@app/hooks/api";
import { TOrgRole } from "@app/hooks/api/roles/types";
import { DuplicateOrgRoleModal } from "@app/pages/organization/RoleByIDPage/components/DuplicateOrgRoleModal";
import { RoleModal } from "@app/pages/organization/RoleByIDPage/components/RoleModal";

export const OrgRoleTable = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "role",
    "deleteRole",
    "duplicateRole",
    "upgradePlan"
  ] as const);

  const { data: roles, isPending: isRolesLoading } = useGetOrgRoles(orgId);
  const { mutateAsync: deleteRole } = useDeleteOrgRole();
  const { mutateAsync: updateOrg } = useUpdateOrg();
  const { subscription } = useSubscription();

  const handleRoleDelete = async () => {
    const { id } = popUp?.deleteRole?.data as TOrgRole;
    try {
      await deleteRole({
        orgId,
        id
      });
      createNotification({ type: "success", text: "Successfully removed the role" });
      handlePopUpClose("deleteRole");
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to delete role" });
    }
  };

  const handleSetRoleAsDefault = async (defaultMembershipRoleSlug: string) => {
    const isCustomRole = isCustomOrgRole(defaultMembershipRoleSlug);

    if (isCustomRole && subscription && !subscription?.rbac) {
      handlePopUpOpen("upgradePlan", {
        description:
          "You can set the default org role to a custom role if you upgrade your Infisical plan."
      });
      return;
    }

    try {
      await updateOrg({
        orgId,
        defaultMembershipRoleSlug
      });
      createNotification({ type: "success", text: "Successfully updated default membership role" });
      handlePopUpClose("deleteRole");
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to update default membership role" });
    }
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Organization Roles</p>
        <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Role}>
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => {
                handlePopUpOpen("role");
              }}
              isDisabled={!isAllowed}
            >
              Add Role
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Slug</Th>
              <Th aria-label="actions" className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isRolesLoading && <TableSkeleton columns={3} innerKey="org-roles" />}
            {roles?.map((role) => {
              const { id, name, slug } = role;
              const isNonMutatable = ["owner", "admin", "member", "no-access"].includes(slug);
              const isDefaultOrgRole = isCustomOrgRole(slug)
                ? id === currentOrg?.defaultMembershipRole
                : slug === currentOrg?.defaultMembershipRole;
              return (
                <Tr
                  key={`role-list-${id}`}
                  className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                  onClick={() =>
                    navigate({
                      to: "/organization/roles/$roleId",
                      params: {
                        roleId: id
                      }
                    })
                  }
                >
                  <Td className="max-w-md">
                    <div className="flex">
                      <p className="overflow-hidden text-ellipsis whitespace-nowrap">{name}</p>
                      {isDefaultOrgRole && (
                        <Tooltip
                          content={`Members joining your organization will be assigned the ${name} role unless otherwise specified.`}
                        >
                          <div>
                            <Badge variant="success" className="ml-1">
                              Default
                            </Badge>
                          </div>
                        </Tooltip>
                      )}
                    </div>
                  </Td>
                  <Td className="max-w-md overflow-hidden text-ellipsis whitespace-nowrap">
                    {slug}
                  </Td>
                  <Td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild className="rounded-lg">
                        <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                          <FontAwesomeIcon size="sm" icon={faEllipsis} />
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="p-1">
                        <OrgPermissionCan
                          I={OrgPermissionActions.Edit}
                          a={OrgPermissionSubjects.Role}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate({
                                  to: "/organization/roles/$roleId",
                                  params: {
                                    roleId: id
                                  }
                                });
                              }}
                              disabled={!isAllowed}
                            >
                              {`${isNonMutatable ? "View" : "Edit"} Role`}
                            </DropdownMenuItem>
                          )}
                        </OrgPermissionCan>
                        <OrgPermissionCan
                          I={OrgPermissionActions.Create}
                          a={OrgPermissionSubjects.Role}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("duplicateRole", role);
                              }}
                              disabled={!isAllowed}
                            >
                              Duplicate Role
                            </DropdownMenuItem>
                          )}
                        </OrgPermissionCan>
                        {!isDefaultOrgRole && (
                          <OrgPermissionCan
                            I={OrgPermissionActions.Edit}
                            a={OrgPermissionSubjects.Settings}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                disabled={!isAllowed}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSetRoleAsDefault(slug);
                                }}
                              >
                                Set as Default Role
                              </DropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                        )}
                        {!isNonMutatable && (
                          <Tooltip
                            position="left"
                            content={
                              isDefaultOrgRole
                                ? "Cannot delete default organization membership role. Re-assign default to allow deletion."
                                : ""
                            }
                          >
                            <div>
                              <OrgPermissionCan
                                I={OrgPermissionActions.Delete}
                                a={OrgPermissionSubjects.Role}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    className={twMerge(
                                      isAllowed && !isDefaultOrgRole
                                        ? "hover:!bg-red-500 hover:!text-white"
                                        : "pointer-events-none cursor-not-allowed opacity-50"
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePopUpOpen("deleteRole", role);
                                    }}
                                    disabled={!isAllowed || isDefaultOrgRole}
                                  >
                                    Delete Role
                                  </DropdownMenuItem>
                                )}
                              </OrgPermissionCan>
                            </div>
                          </Tooltip>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </TableContainer>
      <RoleModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteRole.isOpen}
        title={`Are you sure you want to delete ${
          (popUp?.deleteRole?.data as TOrgRole)?.name || " "
        } role?`}
        onChange={(isOpen) => handlePopUpToggle("deleteRole", isOpen)}
        deleteKey={(popUp?.deleteRole?.data as TOrgRole)?.slug || ""}
        onClose={() => handlePopUpClose("deleteRole")}
        onDeleteApproved={handleRoleDelete}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      />
      <DuplicateOrgRoleModal
        isOpen={popUp.duplicateRole.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("duplicateRole", isOpen)}
        roleId={(popUp?.duplicateRole?.data as TOrgRole)?.id}
      />
    </div>
  );
};
