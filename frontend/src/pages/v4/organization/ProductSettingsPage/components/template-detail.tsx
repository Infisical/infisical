import { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useSearch } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { getProjectTitle } from "@app/helpers/project";
import { isCustomProjectRole } from "@app/helpers/roles";
import { ProjectType } from "@app/hooks/api/projects/types";
import { InfisicalProjectTemplate, type TProjectTemplate } from "@app/hooks/api/projectTemplates";
import type { TProjectRole } from "@app/hooks/api/roles/types";

import { useOrgId, useOrgPermission } from "../../../access/permissions";
import { projectToApi } from "../../../access/roles/permissions-model";
import { RoleEditor } from "../../../access/roles/role-detail";
import { failed, saved } from "../../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { useGo } from "../../../links";
import { PageLoader } from "../../../shell/project-gate";
import {
  TemplateGroupsCard,
  TemplateIdentitiesCard,
  TemplateUsersCard
} from "./template-assignments";
import { TemplateDetailsDialog } from "./template-details-dialog";
import { TemplateEnvironmentsCard } from "./template-environments";
import { customRoles, roleUsage } from "./template-role-usage";
import { TemplateRolesCard } from "./template-roles";

type Links = { back: string; backLabel: string; template: string };

const roleLink = (templateHref: string, slug: string) =>
  `${templateHref}?role=${encodeURIComponent(slug)}`;

const TemplateRoleEditor = ({
  template,
  slug,
  canEdit,
  links
}: {
  template: TProjectTemplate;
  slug: string;
  canEdit: boolean;
  links: Links;
}) => {
  const go = useGo();
  const update = useV4Adapter("productSettings").useUpdateProjectTemplate();
  const role = template.roles.find((item) => item.slug === slug);
  if (!role)
    return (
      <EmptyState
        icon="lock"
        title="Role not found"
        description="This role may have been removed from the template."
        actions={
          <Button variant="outline" icon="chev-left" asChild>
            <a href={links.template}>Back to template</a>
          </Button>
        }
      />
    );
  const others = customRoles(template).filter((item) => item.slug !== role.slug);
  const editorRole: TProjectRole = {
    ...role,
    id: role.slug,
    projectId: "",
    description: null,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt
  };
  return (
    <RoleEditor
      key={role.slug}
      scope="project"
      role={editorRole}
      isCustom={isCustomProjectRole(role.slug)}
      isDefault={false}
      taken={template.roles.map((item) => item.slug)}
      backHref={links.template}
      backLabel={template.name}
      describable={false}
      can={{ edit: canEdit, create: canEdit, delete: canEdit }}
      references={{ environments: template.environments?.map((environment) => environment.slug) }}
      vaultConnections={[]}
      savePermissions={async (permissions) => {
        await update.mutateAsync({
          templateId: template.id,
          roles: customRoles(template).map((item) =>
            item.slug === role.slug ? { ...item, permissions: projectToApi(permissions) } : item
          )
        });
      }}
      update={async ({ name, slug: nextSlug }) => {
        try {
          await update.mutateAsync({
            templateId: template.id,
            roles: customRoles(template).map((item) =>
              item.slug === role.slug ? { ...item, name, slug: nextSlug } : item
            )
          });
          saved(`Role "${name}" updated`);
          if (nextSlug !== role.slug) go(roleLink(links.template, nextSlug));
          return true;
        } catch (error) {
          failed("Failed to update template role", error);
          return false;
        }
      }}
      duplicate={async ({ name, slug: nextSlug }) => {
        try {
          await update.mutateAsync({
            templateId: template.id,
            roles: [
              ...customRoles(template),
              { name, slug: nextSlug, permissions: role.permissions }
            ]
          });
          saved(`Role "${name}" duplicated`);
          go(roleLink(links.template, nextSlug));
          return true;
        } catch (error) {
          failed("Failed to duplicate template role", error);
          return false;
        }
      }}
      remove={async () => {
        const usage = roleUsage(template, role.slug);
        if (usage.length) {
          failed(`Cannot remove role "${role.slug}" because it is assigned to ${usage.join(", ")}`);
          return;
        }
        try {
          await update.mutateAsync({ templateId: template.id, roles: others });
          saved(`Role "${role.name}" removed from template`);
          go(links.template);
        } catch (error) {
          failed("Failed to remove role from template", error);
        }
      }}
    />
  );
};

const TemplateOverview = ({
  template,
  canEdit,
  canDelete,
  links
}: {
  template: TProjectTemplate;
  canEdit: boolean;
  canDelete: boolean;
  links: Links;
}) => {
  const go = useGo();
  const deleteTemplate = useV4Adapter("productSettings").useDeleteProjectTemplate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isDefault = template.name === InfisicalProjectTemplate.Default;

  const remove = async () => {
    try {
      await deleteTemplate.mutateAsync({ templateId: template.id });
      saved(`Project template "${template.name}" deleted`);
      go(links.back);
    } catch (error) {
      failed("Failed to delete project template", error);
    }
  };

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <div>
          <Button variant="ghost" size="sm" icon="chev-left" asChild>
            <a href={links.back}>{links.backLabel}</a>
          </Button>
        </div>
        <PageHeader
          title={template.name}
          badges={<Badge tone="soft">{getProjectTitle(template.type)}</Badge>}
          description={template.description || undefined}
          actions={
            !isDefault && (
              <Inline gap={8}>
                <Button
                  variant="outline"
                  disabledReason={canEdit ? undefined : RESTRICTED}
                  onClick={() => setEditing(true)}
                >
                  <PencilIcon />
                  Edit details
                </Button>
                <Button
                  variant="outline"
                  icon="trash"
                  disabledReason={canDelete ? undefined : RESTRICTED}
                  onClick={() => setDeleting(true)}
                >
                  Delete template
                </Button>
              </Inline>
            )
          }
        />
      </Stack>
      {template.type === ProjectType.SecretManager && (
        <TemplateEnvironmentsCard template={template} canEdit={canEdit} readOnly={isDefault} />
      )}
      <TemplateRolesCard
        template={template}
        canEdit={canEdit}
        readOnly={isDefault}
        roleHref={(slug) => roleLink(links.template, slug)}
      />
      {!isDefault && (
        <>
          <TemplateUsersCard template={template} canEdit={canEdit} />
          <TemplateGroupsCard template={template} canEdit={canEdit} />
          <TemplateIdentitiesCard template={template} canEdit={canEdit} />
        </>
      )}
      {editing && (
        <TemplateDetailsDialog
          projectType={template.type}
          template={template}
          onOpenChange={setEditing}
        />
      )}
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete "${template.name}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Projects already created from it keep their settings. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};

export const TemplateDetail = ({
  templateId,
  projectType,
  links
}: {
  templateId: string;
  projectType: ProjectType;
  links: Links;
}) => {
  const orgId = useOrgId();
  const { role } = useSearch({ strict: false }) as { role?: string };
  const { permission, isPending: permissionPending } = useOrgPermission();
  const productSettings = useV4Adapter("productSettings");
  const { data: subscription } = productSettings.useSubscription(orgId);
  const canRead = permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.ProjectTemplates);
  const { data: templates, isPending } = productSettings.useProjectTemplates({
    enabled: canRead && Boolean(subscription?.projectTemplates)
  });
  const template = useMemo(() => {
    const found = templates?.find((item) => item.id === templateId && item.type === projectType);
    if (!found) return undefined;
    return {
      ...found,
      roles: found.roles.map((item) => ({
        ...item,
        permissions: item.permissions.filter((entry) => entry.subject !== "secret-events")
      }))
    };
  }, [templates, templateId, projectType]);
  const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.ProjectTemplates);
  const canDelete = permission.can(
    OrgPermissionActions.Delete,
    OrgPermissionSubjects.ProjectTemplates
  );

  let body;
  if (permissionPending || (canRead && isPending && subscription?.projectTemplates))
    body = <PageLoader label="Loading project template" />;
  else if (!canRead) body = <AccessRestricted requirement="read Project Templates" />;
  else if (!template)
    body = (
      <EmptyState
        icon="layout-grid"
        title="Project template not found"
        description="This template may have been deleted."
        actions={
          <Button variant="outline" icon="chev-left" asChild>
            <a href={links.back}>{links.backLabel}</a>
          </Button>
        }
      />
    );
  else if (role)
    body = <TemplateRoleEditor template={template} slug={role} canEdit={canEdit} links={links} />;
  else
    body = (
      <TemplateOverview template={template} canEdit={canEdit} canDelete={canDelete} links={links} />
    );

  return (
    <TooltipProvider>
      <PageTitle title="Project Template" />
      {body}
    </TooltipProvider>
  );
};
