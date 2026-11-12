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
import { Button } from "@infisical/cipher/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { useParams } from "@tanstack/react-router";
import { LayersIcon, PencilIcon, SaveIcon } from "lucide-react";

import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { isCustomOrgRole, isCustomProjectRole } from "@app/helpers/roles";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TOrgRole, TProjectRole } from "@app/hooks/api/roles/types";
import { sanitizeDuplicateRolePermissions } from "@app/pages/project/RoleDetailsBySlugPage/components/DuplicateProjectRoleModal.utils";
import { OrgAccessControlTabSections } from "@app/types/org";
import { ProjectAccessControlTabs } from "@app/types/project";

import { useV4Adapter } from "../../data/adapters";
import { PageLoader } from "../../shell/project-gate";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useOrgPermission, useProjectPermission } from "../permissions";
import { useProjectScope } from "../project/scope";
import { failed, saved, toast } from "../toast";
import { AccessRestricted, Gate, RESTRICTED } from "../ui";
import {
  orgToApi,
  type PermissionErrors,
  permissionsFromApi,
  permissionsToApi,
  projectToApi,
  type RolePermissions,
  type RoleScope,
  subjectsFor,
  validatePermissions
} from "./permissions-model";
import { PolicyTemplateSheet } from "./policy-template-sheet";
import { OrgRoleDialog, ProjectRoleSheet, type RoleDraft } from "./role-dialogs";
import { RuleTable } from "./rule-table";
import { VaultImportSheet } from "./vault-import-sheet";

const BUILT_IN = "Built-in roles are read only";
const DEFAULT_ROLE = "This is the default role for new members. Set another default to delete it.";

type Overlay = "edit" | "duplicate" | "delete" | "discard" | "template" | "vault";

type EditorProps = {
  scope: RoleScope;
  role: TOrgRole | TProjectRole;
  isCustom: boolean;
  isDefault: boolean;
  taken: readonly string[];
  backHref: string;
  can: { edit: boolean; create: boolean; delete: boolean };
  references: { environments?: readonly string[]; tags?: readonly string[] };
  vaultConnections: readonly { id: string; name: string }[];
  savePermissions: (permissions: RolePermissions) => Promise<void>;
  update: (draft: RoleDraft) => Promise<boolean>;
  duplicate: (draft: RoleDraft) => Promise<boolean>;
  remove: () => Promise<void>;
};

const RoleEditor = ({
  scope,
  role,
  isCustom,
  isDefault,
  taken,
  backHref,
  can,
  references,
  vaultConnections,
  savePermissions,
  update,
  duplicate,
  remove
}: EditorProps) => {
  const stored = useMemo(
    () => permissionsFromApi(scope, role.permissions),
    [scope, role.permissions]
  );
  const [draft, setDraft] = useState<RolePermissions>();
  const [errors, setErrors] = useState<PermissionErrors>();
  const [overlay, setOverlay] = useState<Overlay>();
  const [saving, setSaving] = useState(false);
  const current = draft ?? stored;
  const editable = isCustom && can.edit;
  const reason = isCustom ? RESTRICTED : BUILT_IN;
  const dirty =
    draft !== undefined &&
    JSON.stringify(permissionsToApi(scope, draft)) !==
      JSON.stringify(permissionsToApi(scope, stored));
  const builtInNote = isCustom ? undefined : BUILT_IN;

  const change = (next: RolePermissions) => {
    setDraft(next);
    if (errors) setErrors(validatePermissions(scope, next));
  };

  const save = async () => {
    const found = validatePermissions(scope, current);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setErrors(undefined);
    setSaving(true);
    try {
      await savePermissions(current);
      setDraft(undefined);
      saved(scope === "org" ? "Successfully updated role" : `Project role "${role.name}" updated`);
    } catch (error) {
      failed("Failed to update role", error);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDraft(undefined);
    setErrors(undefined);
  };

  const copy = (value: string, title: string) => {
    navigator.clipboard?.writeText(value).catch(() => undefined);
    toast({ tone: "neutral", title });
  };

  const closeOverlay = (next: boolean) => !next && setOverlay(undefined);
  const submitWith = (run: (draft: RoleDraft) => Promise<boolean>) => async (next: RoleDraft) => {
    if (await run(next)) setOverlay(undefined);
  };

  const importMenu = scope === "project" && (
    <Gate allowed={editable} reason={reason}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button layout="trigger" type="button" variant="outline" disabled={!editable}>
            Import
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!editable} onSelect={() => setOverlay("template")}>
            <Icon icon={LayersIcon} />
            Add from template
          </DropdownMenuItem>
          {vaultConnections.length > 0 && (
            <DropdownMenuItem disabled={!editable} onSelect={() => setOverlay("vault")}>
              <Icon name="download" />
              Add from HashiCorp Vault
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </Gate>
  );

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <div>
          <Button variant="ghost" size="sm" icon="chev-left" asChild>
            <a href={backHref}>{scope === "org" ? "Roles" : "Project roles"}</a>
          </Button>
        </div>
        <PageHeader
          title={role.name}
          description={`${role.slug}${role.description ? ` - ${role.description}` : ""}`}
          actions={
            <Inline gap={8}>
              {importMenu}
              <Button
                type="button"
                variant="ghost"
                disabled={!dirty || saving}
                onClick={() => (scope === "project" ? setOverlay("discard") : discard())}
              >
                Discard
              </Button>
              <Gate allowed={editable} reason={reason}>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!editable || !dirty}
                  loading={saving}
                  onClick={save}
                >
                  <Icon icon={SaveIcon} />
                  Save
                </Button>
              </Gate>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" iconRight="more">
                    Options
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => copy(role.id, "Copied ID to clipboard")}>
                    <Icon name="copy" />
                    Copy ID
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => copy(role.slug, "Copied slug to clipboard")}>
                    <Icon name="copy" />
                    Copy slug
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!isCustom || !can.edit}
                    description={builtInNote}
                    onSelect={() => setOverlay("edit")}
                  >
                    <Icon icon={PencilIcon} />
                    Edit role
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!isCustom || !can.create}
                    description={builtInNote}
                    onSelect={() => setOverlay("duplicate")}
                  >
                    <Icon name="copy" />
                    Duplicate role
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={!isCustom || !can.delete || isDefault}
                    description={isDefault ? DEFAULT_ROLE : builtInNote}
                    onSelect={() => setOverlay("delete")}
                  >
                    <Icon name="trash" />
                    Delete role
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Inline>
          }
        />
      </Stack>
      <RuleTable
        scope={scope}
        draft={current}
        subjects={subjectsFor(scope)}
        editable={editable}
        reason={reason}
        errors={errors}
        references={references}
        onChange={change}
      />
      {overlay === "edit" &&
        (scope === "org" ? (
          <OrgRoleDialog
            role={role}
            mode="update"
            taken={taken.filter((slug) => slug !== role.slug)}
            open
            onOpenChange={closeOverlay}
            onSubmit={submitWith(update)}
          />
        ) : (
          <ProjectRoleSheet
            role={role}
            mode="update"
            taken={taken.filter((slug) => slug !== role.slug)}
            open
            onOpenChange={closeOverlay}
            onSubmit={submitWith(update)}
          />
        ))}
      {overlay === "duplicate" &&
        (scope === "org" ? (
          <OrgRoleDialog
            role={role}
            mode="duplicate"
            taken={taken}
            open
            onOpenChange={closeOverlay}
            onSubmit={submitWith(duplicate)}
          />
        ) : (
          <ProjectRoleSheet
            role={role}
            mode="duplicate"
            taken={taken}
            open
            onOpenChange={closeOverlay}
            onSubmit={submitWith(duplicate)}
          />
        ))}
      <AlertDialog open={overlay === "delete"} onOpenChange={closeOverlay}>
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {scope === "org"
                ? `Are you sure you want to delete the organization role ${role.name}?`
                : `Delete "${role.name}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              {scope === "org" ? "Delete" : "Delete role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={overlay === "discard"} onOpenChange={closeOverlay}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved changes to this role&apos;s policies will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={discard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {scope === "project" && (
        <>
          <PolicyTemplateSheet
            open={overlay === "template"}
            onOpenChange={(next) => setOverlay(next ? "template" : undefined)}
            permissions={current}
            onApply={change}
          />
          {overlay === "vault" && (
            <VaultImportSheet
              open
              onOpenChange={(next) => setOverlay(next ? "vault" : undefined)}
              connections={vaultConnections}
              permissions={current}
              onApply={change}
            />
          )}
        </>
      )}
    </Stack>
  );
};

const NotFound = ({ backHref }: { backHref: string }) => (
  <EmptyState
    icon="lock"
    title="Role not found"
    description="This role may have been deleted."
    actions={
      <Button variant="outline" icon="chev-left" asChild>
        <a href={backHref}>Back to roles</a>
      </Button>
    }
  />
);

const OrgRoleDetail = ({ orgId, roleId }: { orgId: string; roleId: string }) => {
  const access = useV4Adapter("access");
  const go = useGo();
  const { permission, isPending: permissionPending } = useOrgPermission();
  const { data: role, isPending } = access.useOrgRole(orgId, roleId);
  const { data: roles } = access.useOrgRoles(orgId);
  const { data: org } = access.useOrganization(orgId);
  const updateRole = access.useUpdateOrgRole();
  const createRole = access.useCreateOrgRole();
  const deleteRole = access.useDeleteOrgRole();
  const backHref = accessLinks.org(orgId, OrgAccessControlTabSections.Roles);

  const canRead = permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  if (permissionPending || (canRead && isPending)) return <PageLoader label="Loading role" />;
  if (!canRead) return <AccessRestricted requirement="read Role" />;
  if (!role) return <NotFound backHref={backHref} />;

  const isCustom = isCustomOrgRole(role.slug);
  return (
    <RoleEditor
      key={role.id}
      scope="org"
      role={role}
      isCustom={isCustom}
      isDefault={org?.defaultMembershipRole === role.id || org?.defaultMembershipRole === role.slug}
      taken={(roles ?? []).map((item) => item.slug)}
      backHref={backHref}
      can={{
        edit: permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Role),
        create: permission.can(OrgPermissionActions.Create, OrgPermissionSubjects.Role),
        delete: permission.can(OrgPermissionActions.Delete, OrgPermissionSubjects.Role)
      }}
      references={{}}
      vaultConnections={[]}
      savePermissions={async (permissions) => {
        await updateRole.mutateAsync({ orgId, id: role.id, permissions: orgToApi(permissions) });
      }}
      update={async (draft) => {
        try {
          await updateRole.mutateAsync({ orgId, id: role.id, ...draft });
          saved("Successfully updated role");
          return true;
        } catch (error) {
          failed("Failed to update role", error);
          return false;
        }
      }}
      duplicate={async (draft) => {
        try {
          const created = await createRole.mutateAsync({
            orgId,
            ...draft,
            permissions: role.permissions
          });
          saved("Role duplicated successfully");
          go(accessLinks.orgRole(orgId, created.id));
          return true;
        } catch (error) {
          failed("Failed to duplicate role", error);
          return false;
        }
      }}
      remove={async () => {
        try {
          await deleteRole.mutateAsync({ orgId, id: role.id });
          saved("Successfully deleted organization role");
          go(backHref);
        } catch (error) {
          failed("Failed to delete organization role", error);
        }
      }}
    />
  );
};

const ProjectRoleDetail = ({ projectId, roleSlug }: { projectId: string; roleSlug: string }) => {
  const scope = useProjectScope();
  const access = useV4Adapter("access");
  const go = useGo();
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const { data: role, isPending } = access.useProjectRole(projectId, roleSlug, scope.projectType);
  const { data: roles } = access.useProjectRoles(projectId, scope.projectType);
  const { data: project } = access.useProject(projectId);
  const { data: tags } = access.useProjectTags(projectId);
  const canEdit = permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Role);
  const { data: vaultConnections } = access.useAvailableAppConnections(
    AppConnection.HCVault,
    projectId,
    { enabled: canEdit }
  );
  const updateRole = access.useUpdateProjectRole();
  const createRole = access.useCreateProjectRole();
  const deleteRole = access.useDeleteProjectRole();
  const backHref = accessLinks.project(scope, ProjectAccessControlTabs.Roles);

  const canRead = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  if (permissionPending || (canRead && isPending)) return <PageLoader label="Loading role" />;
  if (!canRead) return <AccessRestricted requirement="read Role" />;
  if (!role) return <NotFound backHref={backHref} />;

  return (
    <RoleEditor
      key={role.id}
      scope="project"
      role={role}
      isCustom={isCustomProjectRole(role.slug)}
      isDefault={false}
      taken={(roles ?? []).map((item) => item.slug)}
      backHref={backHref}
      can={{
        edit: canEdit,
        create: permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Role),
        delete: permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.Role)
      }}
      references={{
        environments: project?.environments.map((environment) => environment.slug),
        tags: tags?.map((tag) => tag.slug)
      }}
      vaultConnections={canEdit ? (vaultConnections ?? []) : []}
      savePermissions={async (permissions) => {
        await updateRole.mutateAsync({
          projectId,
          projectType: scope.projectType,
          id: role.id,
          permissions: projectToApi(permissions)
        });
      }}
      update={async (draft) => {
        try {
          const next = await updateRole.mutateAsync({
            projectId,
            projectType: scope.projectType,
            id: role.id,
            ...draft
          });
          saved(`Project role "${next.name}" updated`);
          if (next.slug !== roleSlug) go(accessLinks.projectRole(scope, next.slug));
          return true;
        } catch (error) {
          failed("Failed to update project role", error);
          return false;
        }
      }}
      duplicate={async (draft) => {
        try {
          const created = await createRole.mutateAsync({
            projectId,
            projectType: scope.projectType,
            ...draft,
            permissions: sanitizeDuplicateRolePermissions(role.permissions)
          });
          saved(`Project role "${draft.name}" duplicated`);
          go(accessLinks.projectRole(scope, created.slug));
          return true;
        } catch (error) {
          failed("Failed to duplicate project role", error);
          return false;
        }
      }}
      remove={async () => {
        try {
          await deleteRole.mutateAsync({ projectId, projectType: scope.projectType, id: role.id });
          saved("Successfully deleted project role");
          go(backHref);
        } catch (error) {
          failed("Failed to delete project role", error);
        }
      }}
    />
  );
};

export const RoleDetail = () => {
  const params = useParams({ strict: false });
  if (params.projectId && params.roleSlug)
    return <ProjectRoleDetail projectId={params.projectId} roleSlug={params.roleSlug} />;
  return <OrgRoleDetail orgId={params.orgId ?? ""} roleId={params.roleId ?? ""} />;
};
