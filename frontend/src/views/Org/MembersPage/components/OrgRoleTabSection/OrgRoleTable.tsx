import { faEllipsis,faPlus } from "@fortawesome/free-solid-svg-icons";
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

type Props = {
  onSelectRole: (role?: TOrgRole) => void;
};

export const OrgRoleTable = ({ onSelectRole }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
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
              onClick={() => onSelectRole()}
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
                          renderTooltip
                          allowedLabel="Edit"
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={() => onSelectRole(role)}
                              disabled={!isAllowed}
                            >
                              Edit Role
                            </DropdownMenuItem>
                          )}
                        </OrgPermissionCan>
                        <OrgPermissionCan
                          I={OrgPermissionActions.Delete}
                          a={OrgPermissionSubjects.Role}
                          renderTooltip
                          allowedLabel={
                            isNonMutatable ? "Reserved roles are non-removable" : "Delete"
                          }
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                isAllowed
                                  ? "hover:!bg-red-500 hover:!text-white"
                                  : "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={() => handlePopUpOpen("deleteRole", role)}
                              disabled={!isAllowed}
                            >
                              Delete Role
                            </DropdownMenuItem>
                          )}
                        </OrgPermissionCan>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </TableContainer>
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
