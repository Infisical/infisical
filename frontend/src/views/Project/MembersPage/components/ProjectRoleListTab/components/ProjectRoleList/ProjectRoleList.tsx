import { useState } from "react";
import { faEdit, faMagnifyingGlass, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  IconButton,
  Input,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteProjectRole, useGetProjectRoles } from "@app/hooks/api";
import { TProjectRole } from "@app/hooks/api/roles/types";

type Props = {
  onSelectRole: (role?: TProjectRole) => void;
};

export const ProjectRoleList = ({ onSelectRole }: Props) => {
  const [searchRoles, setSearchRoles] = useState("");
  const { createNotification } = useNotificationContext();
  const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp(["deleteRole"] as const);
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";

  const { data: roles, isLoading: isRolesLoading } = useGetProjectRoles(workspaceId);
  console.log(roles);

  const { mutateAsync: deleteRole } = useDeleteProjectRole();

  const handleRoleDelete = async () => {
    const { id } = popUp?.deleteRole?.data as TProjectRole;
    try {
      await deleteRole({
        projectId: workspaceId,
        id
      });
      createNotification({ type: "success", text: "Successfully removed the role" });
      handlePopUpClose("deleteRole");
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to create role" });
    }
  };

  return (
    <div className="w-full">
      <div className="mb-4 flex">
        <div className="mr-4 flex-1">
          <Input
            value={searchRoles}
            onChange={(e) => setSearchRoles(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            placeholder="Search roles..."
          />
        </div>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Role}>
          {(isAllowed) => (
            <Button
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => onSelectRole()}
              isDisabled={!isAllowed}
            >
              Add Role
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <div>
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Slug</Th>
                <Th aria-label="actions" />
              </Tr>
            </THead>
            <TBody>
              {isRolesLoading && <TableSkeleton columns={4} innerKey="org-roles" />}
              {roles?.map((role) => {
                const { id, name, slug } = role;
                const isNonMutatable = ["admin", "member", "viewer", "no-access"].includes(slug);

                return (
                  <Tr key={`role-list-${id}`}>
                    <Td>{name}</Td>
                    <Td>{slug}</Td>
                    <Td>
                      <div className="flex justify-end space-x-2">
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Edit}
                          a={ProjectPermissionSub.Role}
                          renderTooltip
                          allowedLabel="Edit"
                        >
                          {(isAllowed) => (
                            <IconButton
                              isDisabled={!isAllowed}
                              ariaLabel="edit"
                              onClick={() => onSelectRole(role)}
                              variant="plain"
                            >
                              <FontAwesomeIcon icon={faEdit} />
                            </IconButton>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Delete}
                          a={ProjectPermissionSub.Role}
                          renderTooltip
                          allowedLabel={
                            isNonMutatable ? "Reserved roles are non-removable" : "Delete"
                          }
                        >
                          {(isAllowed) => (
                            <IconButton
                              ariaLabel="delete"
                              onClick={() => handlePopUpOpen("deleteRole", role)}
                              variant="plain"
                              isDisabled={isNonMutatable || !isAllowed}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </IconButton>
                          )}
                        </ProjectPermissionCan>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      </div>
      <DeleteActionModal
        isOpen={popUp.deleteRole.isOpen}
        title={`Are you sure want to delete ${
          (popUp?.deleteRole?.data as TProjectRole)?.name || " "
        } role?`}
        deleteKey={(popUp?.deleteRole?.data as TProjectRole)?.slug || ""}
        onClose={() => handlePopUpClose("deleteRole")}
        onDeleteApproved={handleRoleDelete}
      />
    </div>
  );
};
