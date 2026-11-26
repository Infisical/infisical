import { type ComponentProps, useMemo, useState } from "react";
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
import { SaveIcon } from "lucide-react";

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
import { ProjectType } from "@app/hooks/api/projects/types";
import type { TOrgRole, TProjectRole } from "@app/hooks/api/roles/types";
import { sanitizeDuplicateRolePermissions } from "@app/pages/project/RoleDetailsBySlugPage/components/DuplicateProjectRoleModal.utils";
import { OrgAccessControlTabSections } from "@app/types/org";
import { ProjectAccessControlTabs } from "@app/types/project";

import { copyText } from "../../clipboard";
import { useV4Adapter } from "../../data/adapters";
import { PageLoader } from "../../shell/project-gate";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useCustomRoleGate } from "../org/custom-role-gate";
import { useOrgPermission, useProjectPermission } from "../permissions";
import { useProjectPlanGates } from "../project/plan-gates";
import { useProjectScope } from "../project/scope";
import { failed, saved, toast } from "../toast";
import { AccessRestricted, Gate, RESTRICTED } from "../ui";
import type { PermissionSubject } from "./catalog";
import {
  orgToApi,
  type PermissionErrors,
  permissionsFromApi,
  permissionsToApi,
  projectToApi,
  type RolePermissions,
  type RoleScope,
  SUB_ORG_SUBJECTS,
  subjectsFor,
  validatePermissions
} from "./permissions-model";
import { PolicyTemplateSheet } from "./policy-template-sheet";
import { OrgRoleDialog, ProjectRoleSheet, type RoleDraft } from "./role-dialogs";
import { RuleTable } from "./rule-table";
import { VaultImportSheet } from "./vault-import-sheet";

const BUILT_IN = "Built-in roles are read only";
const ADMIN_OR_MEMBER_PRODUCTS = new Set<ProjectType>([ProjectType.PAM, ProjectType.AgentVault]);
const BACK_LABEL: Record<RoleScope, string> = { org: "Roles", project: "Project roles" };
const DEFAULT_ROLE = "This is the default role for new members. Set another default to delete it.";

type Overlay = "edit" | "duplicate" | "delete" | "discard" | "template" | "vault";

const RoleOptions = ({
  role,
  isCustom,
  isDefault,
  can,
  onOpen
}: Pick<RoleEditorProps, "role" | "isCustom" | "isDefault" | "can"> & {
  onOpen: (overlay: Overlay) => void;
}) => {
  const builtInNote = isCustom ? undefined : BUILT_IN;
  const copy = async (value: string, title: string) => {
    if (await copyText(value)) toast({ tone: "neutral", title });
  };
  return (
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
          onSelect={() => onOpen("edit")}
        >
          <Icon name="pencil" />
          Edit role
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!isCustom || !can.create}
          description={builtInNote}
          onSelect={() => onOpen("duplicate")}
        >
          <Icon name="copy" />
          Duplicate role
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!isCustom || !can.delete || isDefault}
          description={isDefault ? DEFAULT_ROLE : builtInNote}
          onSelect={() => onOpen("delete")}
        >
          <Icon name="trash" />
          Delete role
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const RoleForm = ({
  scope,
  mode,
  role,
  taken,
  withDescription,
  ...props
}: { scope: RoleScope; mode: "edit" | "duplicate" } & Omit<
  ComponentProps<typeof ProjectRoleSheet>,
  "open" | "mode"
>) => {
  const shared = {
    ...props,
    role,
    mode: mode === "edit" ? ("update" as const) : ("duplicate" as const),
    taken: mode === "edit" ? taken.filter((slug) => slug !== role.slug) : taken,
    open: true
  };
  return scope === "org" ? (
    <OrgRoleDialog {...shared} />
  ) : (
    <ProjectRoleSheet {...shared} withDescription={withDescription} />
  );
};

const ImportSheets = ({
  overlay,
  onOverlay,
  projectType,
  connections,
  permissions,
  onApply
}: {
  overlay?: Overlay;
  onOverlay: (overlay?: Overlay) => void;
  projectType?: ProjectType;
  connections: readonly { id: string; name: string }[];
  permissions: RolePermissions;
  onApply: (next: RolePermissions) => void;
}) => (
  <>
    <PolicyTemplateSheet
      projectType={projectType}
      open={overlay === "template"}
      onOpenChange={(next) => onOverlay(next ? "template" : undefined)}
      permissions={permissions}
      onApply={onApply}
    />
    {overlay === "vault" && (
      <VaultImportSheet
        open
        onOpenChange={(next) => onOverlay(next ? "vault" : undefined)}
        connections={connections}
        permissions={permissions}
        onApply={onApply}
      />
    )}
  </>
);

const ImportMenu = ({
  editable,
  reason,
  withVault,
  onOpen
}: {
  editable: boolean;
  reason: string;
  withVault: boolean;
  onOpen: (overlay: Overlay) => void;
}) => (
  <Gate allowed={editable} reason={reason}>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button layout="trigger" type="button" variant="outline" disabled={!editable}>
          Import
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!editable} onSelect={() => onOpen("template")}>
          <Icon name="layers" />
          Add from template
        </DropdownMenuItem>
        {withVault && (
          <DropdownMenuItem disabled={!editable} onSelect={() => onOpen("vault")}>
            <Icon name="download" />
            Add from HashiCorp Vault
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  </Gate>
);

const DeleteRoleDialog = ({
  scope,
  name,
  open,
  onOpenChange,
  onDelete
}: {
  scope: RoleScope;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => Promise<void>;
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent tone="danger" confirmText="confirm">
      <AlertDialogHeader>
        <AlertDialogTitle>
          {scope === "org"
            ? `Are you sure you want to delete the organization role ${name}?`
            : `Delete "${name}"?`}
        </AlertDialogTitle>
        <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onDelete}>
          {scope === "org" ? "Delete" : "Delete role"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const useRoleDraft = (
  scope: RoleScope,
  role: TOrgRole | TProjectRole,
  savePermissions: (permissions: RolePermissions) => Promise<void>
) => {
  const stored = useMemo(
    () => permissionsFromApi(scope, role.permissions),
    [scope, role.permissions]
  );
  const [draft, setDraft] = useState<RolePermissions>();
  const [errors, setErrors] = useState<PermissionErrors>();
  const [saving, setSaving] = useState(false);
  const current = draft ?? stored;
  const dirty =
    draft !== undefined &&
    JSON.stringify(permissionsToApi(scope, draft)) !==
      JSON.stringify(permissionsToApi(scope, stored));

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

  return { current, errors, saving, dirty, change, save, discard };
};

export type RoleEditorProps = {
  scope: RoleScope;
  role: TOrgRole | TProjectRole;
  isCustom: boolean;
  isDefault: boolean;
  taken: readonly string[];
  backHref: string;
  backLabel?: string;
  describable?: boolean;
  readOnlyReason?: string;
  projectType?: ProjectType;
  subjects?: PermissionSubject[];
  can: { edit: boolean; create: boolean; delete: boolean };
  references: { environments?: readonly string[]; tags?: readonly string[] };
  visualizeProjectId?: string;
  vaultConnections: readonly { id: string; name: string }[];
  savePermissions: (permissions: RolePermissions) => Promise<void>;
  update: (draft: RoleDraft) => Promise<boolean>;
  duplicate: (draft: RoleDraft) => Promise<boolean>;
  remove: () => Promise<void>;
};

export const RoleEditor = ({
  scope,
  role,
  isCustom,
  isDefault,
  taken,
  backHref,
  backLabel,
  describable = true,
  readOnlyReason,
  projectType,
  subjects,
  can,
  references,
  visualizeProjectId,
  vaultConnections,
  savePermissions,
  update,
  duplicate,
  remove
}: RoleEditorProps) => {
  const go = useGo();
  const [overlay, setOverlay] = useState<Overlay>();
  const { current, errors, saving, dirty, change, save, discard } = useRoleDraft(
    scope,
    role,
    savePermissions
  );
  const editable = isCustom && can.edit && !readOnlyReason;
  const reason = readOnlyReason ?? (isCustom ? RESTRICTED : BUILT_IN);

  const closeOverlay = (next: boolean) => !next && setOverlay(undefined);
  const submitWith = (run: (draft: RoleDraft) => Promise<boolean>) => async (next: RoleDraft) => {
    if (await run(next)) setOverlay(undefined);
  };

  return (
    <Stack gap={24}>
      <PageHeader
        breadcrumb={[
          {
            label: backLabel ?? BACK_LABEL[scope],
            link: go.link(backHref)
          }
        ]}
        title={role.name}
        description={role.description || undefined}
        actions={
          <Inline gap={8}>
            {scope === "project" && (
              <ImportMenu
                editable={editable}
                reason={reason}
                withVault={vaultConnections.length > 0}
                onOpen={setOverlay}
              />
            )}
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
            <RoleOptions
              role={role}
              isCustom={isCustom}
              isDefault={isDefault}
              can={can}
              onOpen={setOverlay}
            />
          </Inline>
        }
      />
      <RuleTable
        scope={scope}
        draft={current}
        subjects={subjects ?? subjectsFor(scope, projectType)}
        editable={editable}
        reason={reason}
        errors={errors}
        references={references}
        visualizeProjectId={visualizeProjectId}
        onChange={change}
      />
      {(overlay === "edit" || overlay === "duplicate") && (
        <RoleForm
          scope={scope}
          role={role}
          mode={overlay}
          withDescription={describable}
          taken={taken}
          onOpenChange={closeOverlay}
          onSubmit={submitWith(overlay === "edit" ? update : duplicate)}
        />
      )}
      <DeleteRoleDialog
        scope={scope}
        name={role.name}
        open={overlay === "delete"}
        onOpenChange={closeOverlay}
        onDelete={remove}
      />
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
        <ImportSheets
          overlay={overlay}
          onOverlay={setOverlay}
          projectType={projectType}
          connections={vaultConnections}
          permissions={current}
          onApply={change}
        />
      )}
    </Stack>
  );
};

const NotFound = ({ backHref }: { backHref: string }) => (
  <EmptyState
    icon="id-badge"
    title="Role not found"
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
  const rbacGate = useCustomRoleGate("organization.org-role");
  const backHref = accessLinks.org(orgId, OrgAccessControlTabSections.Roles);

  const canRead = permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  if (permissionPending || (canRead && isPending)) return <PageLoader label="Loading role" />;
  if (!canRead) return <AccessRestricted requirement="read Role" />;
  if (!role) return <NotFound backHref={backHref} />;

  const isCustom = isCustomOrgRole(role.slug);
  const isSubOrganization = Boolean(org?.rootOrgId) && org?.rootOrgId !== org?.id;
  return (
    <>
      <RoleEditor
        key={role.id}
        scope="org"
        role={role}
        subjects={isSubOrganization ? SUB_ORG_SUBJECTS : undefined}
        isCustom={isCustom}
        isDefault={
          org?.defaultMembershipRole === role.id || org?.defaultMembershipRole === role.slug
        }
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
          if (rbacGate.blockedAny()) return false;
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
          if (rbacGate.blockedAny()) return false;
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
      {rbacGate.upgradeGate}
    </>
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
  const gates = useProjectPlanGates();
  const backHref = accessLinks.project(scope, ProjectAccessControlTabs.Roles);
  const writeType =
    scope.projectType === ProjectType.CertificateManager ? undefined : scope.projectType;

  const canRead = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  if (permissionPending || (canRead && isPending)) return <PageLoader label="Loading role" />;
  if (!canRead) return <AccessRestricted requirement="read Role" />;
  if (!role) return <NotFound backHref={backHref} />;

  return (
    <>
      <RoleEditor
        key={role.id}
        scope="project"
        role={role}
        isCustom={isCustomProjectRole(role.slug)}
        isDefault={false}
        taken={(roles ?? []).map((item) => item.slug)}
        backHref={backHref}
        projectType={scope.projectType}
        readOnlyReason={
          ADMIN_OR_MEMBER_PRODUCTS.has(scope.projectType)
            ? "This product only applies the Admin and Member roles, so rules on other roles have no effect"
            : undefined
        }
        can={{
          edit: canEdit,
          create: permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Role),
          delete: permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.Role)
        }}
        references={{
          environments: project?.environments.map((environment) => environment.slug),
          tags: tags?.map((tag) => tag.slug)
        }}
        visualizeProjectId={scope.projectType === ProjectType.SecretManager ? projectId : undefined}
        vaultConnections={canEdit ? (vaultConnections ?? []) : []}
        savePermissions={async (permissions) => {
          await updateRole.mutateAsync({
            projectId,
            projectType: writeType,
            id: role.id,
            permissions: projectToApi(permissions)
          });
        }}
        update={async (draft) => {
          if (gates.rbacBlocked("project.edit-project-role-dialog")) return false;
          try {
            const next = await updateRole.mutateAsync({
              projectId,
              projectType: writeType,
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
          if (gates.rbacBlocked("project.duplicate-project-role")) return false;
          try {
            const created = await createRole.mutateAsync({
              projectId,
              projectType: writeType,
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
            await deleteRole.mutateAsync({ projectId, projectType: writeType, id: role.id });
            saved("Successfully deleted project role");
            go(backHref);
          } catch (error) {
            failed("Failed to delete project role", error);
          }
        }}
      />
      {gates.upgradeGate}
    </>
  );
};

export const RoleDetail = () => {
  const params = useParams({ strict: false });
  const { projectId } = useProjectScope();
  if (projectId && params.roleSlug)
    return <ProjectRoleDetail projectId={projectId} roleSlug={params.roleSlug} />;
  return <OrgRoleDetail orgId={params.orgId ?? ""} roleId={params.roleId ?? ""} />;
};
