import { Plus, Rows3, Trash2, WrenchIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
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
        (role) => role.slug !== slug && isCustomProjectRole(role.slug)
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
    <div>
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
        <Card>
          <CardHeader>
            <CardTitle>Project Roles</CardTitle>
            <CardDescription>
              {isInfisicalTemplate
                ? "Click a role to view the associated permissions."
                : "Add, edit and remove roles for this project template."}
            </CardDescription>
            {!isInfisicalTemplate && (
              <CardAction>
                <OrgPermissionCan
                  I={OrgPermissionActions.Edit}
                  a={OrgPermissionSubjects.ProjectTemplates}
                >
                  {(isAllowed) => (
                    <Button
                      onClick={() => {
                        handlePopUpOpen("editRole");
                      }}
                      variant="project"
                      isDisabled={!isAllowed}
                    >
                      <Plus className="size-4" />
                      Add Role
                    </Button>
                  )}
                </OrgPermissionCan>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {roles.length ? (
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => {
                    const isCustomRole = isCustomProjectRole(role.slug);

                    return (
                      <TableRow
                        key={role.slug}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(evt) => {
                          if (evt.key === "Enter") {
                            handlePopUpOpen("editRole", role);
                          }
                        }}
                        onClick={() => handlePopUpOpen("editRole", role)}
                      >
                        <TableCell>{role.name}</TableCell>
                        <TableCell>
                          <Badge variant="neutral">
                            {isCustomRole ? (
                              <>
                                <WrenchIcon />
                                Custom
                              </>
                            ) : (
                              <>
                                <Rows3 />
                                Platform
                              </>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            {isCustomRole && (
                              <OrgPermissionCan
                                I={OrgPermissionActions.Edit}
                                a={OrgPermissionSubjects.ProjectTemplates}
                                renderTooltip
                                allowedLabel="Remove Role"
                              >
                                {(isAllowed) => (
                                  <IconButton
                                    variant="ghost-muted"
                                    size="xs"
                                    aria-label="delete-icon"
                                    isDisabled={!isAllowed}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      handlePopUpOpen("removeRole", role);
                                    }}
                                  >
                                    <Trash2 className="size-4" />
                                  </IconButton>
                                )}
                              </OrgPermissionCan>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyTitle>No roles assigned to template</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
          <DeleteActionModal
            isOpen={popUp.removeRole.isOpen}
            deleteKey="remove"
            title={`Are you sure you want to remove the role ${roleToDelete?.slug}?`}
            onChange={(isOpen) => handlePopUpToggle("removeRole", isOpen)}
            onDeleteApproved={() => handleRemoveRole(roleToDelete?.slug)}
          />
        </Card>
      )}
    </div>
  );
};
