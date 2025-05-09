import { faEllipsis, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
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
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteProjectRole, useGetProjectRoles } from "@app/hooks/api";
import { ProjectMembershipRole, TProjectRole } from "@app/hooks/api/roles/types";
import { RoleModal } from "@app/pages/project/RoleDetailsBySlugPage/components/RoleModal";

export const ProjectRoleList = () => {
  const navigate = useNavigate();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "role",
    "deleteRole"
  ] as const);
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data: roles, isPending: isRolesLoading } = useGetProjectRoles(projectId);

  const { mutateAsync: deleteRole } = useDeleteProjectRole();

  const handleRoleDelete = async () => {
    const { id } = popUp?.deleteRole?.data as TProjectRole;
    try {
      await deleteRole({
        projectId,
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
        <p className="text-xl font-semibold text-mineshaft-100">Project Roles</p>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Role}>
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("role")}
              isDisabled={!isAllowed}
            >
              Add Role
            </Button>
          )}
        </ProjectPermissionCan>
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
            {isRolesLoading && <TableSkeleton columns={4} innerKey="org-roles" />}
            {roles?.map((role) => {
              const { id, name, slug } = role;
              const isNonMutatable = Object.values(ProjectMembershipRole).includes(
                slug as ProjectMembershipRole
              );

              return (
                <Tr
                  key={`role-list-${id}`}
                  className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                  onClick={() =>
                    navigate({
                      to: `/${currentWorkspace?.type}/$projectId/roles/$roleSlug` as const,
                      params: {
                        projectId: currentWorkspace.id,
                        roleSlug: slug
                      }
                    })
                  }
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
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Edit}
                          a={ProjectPermissionSub.Role}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate({
                                  to: `/${currentWorkspace?.type}/$projectId/roles/$roleSlug` as const,
                                  params: {
                                    projectId: currentWorkspace.id,
                                    roleSlug: slug
                                  }
                                });
                              }}
                              disabled={!isAllowed}
                            >
                              {`${isNonMutatable ? "View" : "Edit"} Role`}
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        {!isNonMutatable && (
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.Role}
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
                          </ProjectPermissionCan>
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
          (popUp?.deleteRole?.data as TProjectRole)?.name || " "
        } role?`}
        deleteKey={(popUp?.deleteRole?.data as TProjectRole)?.slug || ""}
        onClose={() => handlePopUpClose("deleteRole")}
        onDeleteApproved={handleRoleDelete}
      />
    </div>
  );
};
