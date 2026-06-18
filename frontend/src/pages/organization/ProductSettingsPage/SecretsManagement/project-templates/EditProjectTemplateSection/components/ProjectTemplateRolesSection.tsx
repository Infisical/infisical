import { Plus, Rows3, Trash2, WrenchIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
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
        <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-7">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal">Project Roles</h2>
              <p className="mt-2 text-base text-mineshaft-300">
                {isInfisicalTemplate
                  ? "Click a role to view the associated permissions."
                  : "Add, edit and remove roles for this project template."}
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
                    variant="project"
                    size="lg"
                    isDisabled={!isAllowed}
                  >
                    <Plus className="size-4" />
                    Add Role
                  </Button>
                )}
              </OrgPermissionCan>
            )}
          </div>
          <div>
            <Table
              className="table-fixed"
              containerClassName="rounded-lg border-mineshaft-600 bg-mineshaft-800"
            >
              <TableHeader>
                <TableRow>
                  <TableHead className="h-12 px-5 text-sm text-mineshaft-200">Name</TableHead>
                  <TableHead className="h-12 px-5 text-sm text-mineshaft-200">Type</TableHead>
                  <TableHead className="h-12 w-20 px-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.length ? (
                  roles.map((role) => {
                    const isCustomRole = isCustomProjectRole(role.slug);

                    return (
                      <TableRow
                        key={role.slug}
                        className="group w-full cursor-pointer hover:bg-transparent"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(evt) => {
                          if (evt.key === "Enter") {
                            handlePopUpOpen("editRole", role);
                          }
                        }}
                        onClick={() => handlePopUpOpen("editRole", role)}
                      >
                        <TableCell className="h-[56px] px-5 py-2 text-sm font-medium text-mineshaft-100">
                          {role.name}
                        </TableCell>
                        <TableCell className="h-[56px] px-5 py-2">
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-mineshaft-500 bg-mineshaft-700 px-2 py-0.5 text-sm font-medium text-mineshaft-200">
                            {isCustomRole ? (
                              <>
                                <WrenchIcon className="size-4 text-mineshaft-300" />
                                Custom
                              </>
                            ) : (
                              <>
                                <Rows3 className="size-4 text-mineshaft-300" />
                                Platform
                              </>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="h-[56px] px-5 py-2">
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
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 p-0">
                      <Empty className="h-full rounded-none border-0 bg-mineshaft-800 p-6 md:p-8">
                        <EmptyHeader>
                          <EmptyTitle>No roles assigned to template</EmptyTitle>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
