import { useRouter } from "next/router";
import { faEllipsis, faPlus } from "@fortawesome/free-solid-svg-icons";
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
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteOrgRole, useGetOrgRoles } from "@app/hooks/api";
import { TOrgRole } from "@app/hooks/api/roles/types";
import { RoleModal } from "@app/views/Org/RolePage/components";

export const OrgRoleTable = () => {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "role",
    "deleteRole"
  ] as const);

  const { data: roles, isLoading: isRolesLoading } = useGetOrgRoles(orgId);

  const { mutateAsync: deleteRole } = useDeleteOrgRole();

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
              return (
                <Tr
                  key={`role-list-${id}`}
                  className="h-10 cursor-pointer transition-colors duration-300 hover:bg-mineshaft-700"
                  onClick={() => router.push(`/org/${orgId}/roles/${id}`)}
                >
                  <Td>{name}</Td>
                  <Td>{slug}</Td>
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
                                router.push(`/org/${orgId}/roles/${id}`);
                              }}
                              disabled={!isAllowed}
                            >
                              {`${isNonMutatable ? "View" : "Edit"} Role`}
                            </DropdownMenuItem>
                          )}
                        </OrgPermissionCan>
                        {!isNonMutatable && (
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deleteRole", role);
                                }}
                                disabled={!isAllowed}
                              >
                                Delete Role
                              </DropdownMenuItem>
                            )}
                          </OrgPermissionCan>
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
        title={`Are you sure want to delete ${
          (popUp?.deleteRole?.data as TOrgRole)?.name || " "
        } role?`}
        onChange={(isOpen) => handlePopUpToggle("deleteRole", isOpen)}
        deleteKey={(popUp?.deleteRole?.data as TOrgRole)?.slug || ""}
        onClose={() => handlePopUpClose("deleteRole")}
        onDeleteApproved={handleRoleDelete}
      />
    </div>
  );
};
