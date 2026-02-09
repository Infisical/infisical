import { faPlus, faTrash, faUnlock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrgPermission } from "@app/context";
import { isCustomProjectRole } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";
import { TProjectTemplate, useUpdateProjectTemplate } from "@app/hooks/api/projectTemplates";
import { TProjectRole } from "@app/hooks/api/roles/types";

import { ProjectTemplateEditRoleForm } from "./ProjectTemplateEditRoleForm";

type Props = {
  projectTemplate: TProjectTemplate;
  isInfisicalTemplate: boolean;
};

export const ProjectTemplateRolesSection = ({ projectTemplate, isInfisicalTemplate }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "removeRole",
    "editRole"
  ] as const);

  const { permission } = useOrgPermission();

  const { roles } = projectTemplate;

  const updateProjectTemplate = useUpdateProjectTemplate();

  const handleRemoveRole = async (slug: string) => {
    // Check if role is used by users, groups, or identities
    const usersWithRole = projectTemplate.users?.filter((u) => u.roles.includes(slug)) || [];
    const groupsWithRole = projectTemplate.groups?.filter((g) => g.roles.includes(slug)) || [];
    const identitiesWithRole =
      projectTemplate.identities?.filter((i) => i.roles.includes(slug)) || [];
    const projectManagedIdentitiesWithRole =
      projectTemplate.projectManagedIdentities?.filter((i) => i.roles.includes(slug)) || [];

    const usageMessages: string[] = [];

    if (usersWithRole.length > 0)
      usageMessages.push(`${usersWithRole.length} user${usersWithRole.length === 1 ? "" : "s"}`);
    if (groupsWithRole.length > 0)
      usageMessages.push(`${groupsWithRole.length} group${groupsWithRole.length === 1 ? "" : "s"}`);
    if (identitiesWithRole.length > 0 || projectManagedIdentitiesWithRole.length > 0) {
      const totalIdentities = identitiesWithRole.length + projectManagedIdentitiesWithRole.length;
      usageMessages.push(`${totalIdentities} identit${totalIdentities === 1 ? "y" : "ies"}`);
    }

    if (usageMessages.length > 0) {
      createNotification({
        text: `Cannot remove role "${slug}" because it is assigned to ${usageMessages.join(", ")}`,
        type: "error"
      });
      handlePopUpClose("removeRole");
      return;
    }

    await updateProjectTemplate.mutateAsync({
      templateId: projectTemplate.id,
      roles: projectTemplate.roles.filter(
        (role) => role.slug !== slug && isCustomProjectRole(role.slug) // filter out default roles as well
      )
    });

    createNotification({
      text: "Successfully removed role from template",
      type: "success"
    });
    handlePopUpClose("removeRole");
  };

  const editRole = popUp?.editRole?.data as TProjectRole;
  const roleToDelete = popUp?.removeRole?.data as TProjectRole;

  return (
    <div className="relative mb-6">
      {popUp?.editRole.isOpen ? (
        <ProjectTemplateEditRoleForm
          onGoBack={() => handlePopUpClose("editRole")}
          projectTemplate={projectTemplate}
          role={editRole}
          isDisabled={
            permission.cannot(OrgPermissionActions.Edit, OrgPermissionSubjects.ProjectTemplates) ||
            (editRole && !isCustomProjectRole(editRole.slug))
          }
        />
      ) : (
        <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
            <div>
              <h2 className="text-lg font-medium">Project Roles</h2>
              <p className="text-sm text-mineshaft-400">
                {isInfisicalTemplate
                  ? "Click a role to view the associated permissions"
                  : "Add, edit and remove roles for this project template"}
              </p>
            </div>
            {!isInfisicalTemplate && (
              <OrgPermissionCan
                I={OrgPermissionActions.Edit}
                a={OrgPermissionSubjects.ProjectTemplates}
              >
                {(isAllowed) => (
                  <Button
                    onClick={() => {
                      handlePopUpOpen("editRole");
                    }}
                    colorSchema="primary"
                    className="ml-auto"
                    variant="outline_bg"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    isDisabled={!isAllowed}
                  >
                    Add Role
                  </Button>
                )}
              </OrgPermissionCan>
            )}
          </div>
          <div className="py-4">
            <TableContainer>
              <Table>
                <THead>
                  <Tr>
                    <Th>Name</Th>
                    <Th>Slug</Th>
                    <Th className="w-5" />
                  </Tr>
                </THead>
                <TBody>
                  {roles.length ? (
                    roles.map((role) => {
                      return (
                        <Tr
                          key={role.slug}
                          className="group w-full cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                          role="button"
                          tabIndex={0}
                          onKeyDown={(evt) => {
                            if (evt.key === "Enter") {
                              handlePopUpOpen("editRole", role);
                            }
                          }}
                          onClick={() => handlePopUpOpen("editRole", role)}
                        >
                          <Td>{role.name}</Td>
                          <Td>{role.slug}</Td>
                          <Td>
                            {isCustomProjectRole(role.slug) && (
                              <div className="flex space-x-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Edit}
                                  a={OrgPermissionSubjects.ProjectTemplates}
                                  renderTooltip
                                  allowedLabel="Remove Role"
                                >
                                  {(isAllowed) => (
                                    <IconButton
                                      colorSchema="danger"
                                      ariaLabel="delete-icon"
                                      variant="plain"
                                      className="group relative"
                                      isDisabled={!isAllowed}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        handlePopUpOpen("removeRole", role);
                                      }}
                                    >
                                      <FontAwesomeIcon icon={faTrash} />
                                    </IconButton>
                                  )}
                                </OrgPermissionCan>
                              </div>
                            )}
                          </Td>
                        </Tr>
                      );
                    })
                  ) : (
                    <Tr>
                      <Td colSpan={2}>
                        <EmptyState title="No roles assigned to template" icon={faUnlock} />
                      </Td>
                    </Tr>
                  )}
                </TBody>
              </Table>
            </TableContainer>
          </div>
          <DeleteActionModal
            isOpen={popUp.removeRole.isOpen}
            deleteKey="remove"
            title={`Are you sure you want to remove the role ${roleToDelete?.slug}?`}
            onChange={(isOpen) => handlePopUpToggle("removeRole", isOpen)}
            onDeleteApproved={() => handleRemoveRole(roleToDelete?.slug)}
          />
        </div>
      )}
    </div>
  );
};
