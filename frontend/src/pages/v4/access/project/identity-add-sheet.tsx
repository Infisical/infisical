import { useMemo, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Tabs } from "@infisical/cipher/ui/tabs";

import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { AGENT_VAULT_PRODUCT_ROLE_OPTIONS } from "@app/helpers/roles";
import { UNIVERSAL_AUTH_DEFAULTS } from "@app/hooks/api/identities/constants";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole, type TProjectPermission } from "@app/hooks/api/roles/types";
import { RoleTemplates } from "@app/pages/project/RoleDetailsBySlugPage/components/ProjectRoleModifySection.utils";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useProjectPermission } from "../permissions";
import { failed, saved, toast } from "../toast";
import { Muted } from "../ui";
import { accessNoun, accessThis } from "./product";
import { useProjectScope } from "./scope";

export type AddIdentityMode = "create" | "assign";

const templatePermissions = (projectType: ProjectType, templateIds: readonly string[]) => {
  const merged = new Map<string, Set<string>>();
  const selected = new Set(templateIds);
  (RoleTemplates[projectType] ?? [])
    .filter((template) => selected.has(template.id))
    .forEach((template) =>
      template.permissions.forEach(({ subject, actions }) => {
        const current = merged.get(subject) ?? new Set<string>();
        actions.forEach((action) => current.add(action));
        merged.set(subject, current);
      })
    );
  return [...merged].map(([subject, actions]) => ({
    subject,
    action: [...actions]
  })) as TProjectPermission[];
};

const AddIdentityForm = ({
  projectId,
  pending,
  setPending,
  onClose
}: {
  projectId: string;
  pending: boolean;
  setPending: (pending: boolean) => void;
  onClose: () => void;
}) => {
  const scope = useProjectScope();
  const access = useV4Adapter("access");
  const agentVault = useV4Adapter("agentVault");
  const go = useGo();
  const isAgentVault = scope.projectType === ProjectType.AgentVault;
  const { data: projectRoles } = access.useProjectRoles(projectId, scope.projectType);
  const roles = useMemo(() => {
    if (!isAgentVault) return projectRoles;
    return (projectRoles ?? []).flatMap((item) => {
      const productRole = AGENT_VAULT_PRODUCT_ROLE_OPTIONS.find(
        (option) => option.value === item.slug
      );
      return productRole
        ? [{ ...item, name: productRole.label, description: productRole.description }]
        : [];
    });
  }, [projectRoles, isAgentVault]);
  const { data: agentVaultAssignable } = agentVault.useAssignableIdentities(
    projectId,
    isAgentVault
  );
  const createAgentVaultIdentity = agentVault.useCreateManagedIdentity(projectId);
  const addAgentVaultMembers = agentVault.useAddMembers(projectId);
  const { data: availableIdentities } = access.useAvailableProjectIdentities({
    projectId,
    projectType: scope.projectType
  });
  const { data: members } = access.useProjectIdentities({
    projectId,
    projectType: scope.projectType,
    offset: 0,
    limit: 1000
  });
  const createIdentity = access.useCreateProjectManagedIdentity();
  const updateRoles = access.useUpdateProjectIdentityRoles();
  const addMembership = access.useAddProjectIdentity();
  const addUniversalAuth = access.useAddIdentityUniversalAuth();
  const createPrivilege = access.useCreateIdentityProjectPrivilege();
  const project = access.useProject(projectId).data;
  const { permission } = useProjectPermission(projectId);
  const canGrantPrivileges =
    scope.projectType === ProjectType.SecretManager &&
    Boolean(project?.isLegacyAdditionalPrivilegesEnabled) &&
    permission.can(ProjectPermissionIdentityActions.Edit, ProjectPermissionSub.Identity) &&
    permission.can(
      ProjectPermissionIdentityActions.AssignAdditionalPrivileges,
      ProjectPermissionSub.Identity
    );
  const templates = RoleTemplates[scope.projectType] ?? [];
  const [templateIds, setTemplateIds] = useState<string[]>([]);

  const assignable = useMemo(() => {
    if (isAgentVault) return agentVaultAssignable ?? [];
    const existing = new Set(members?.identityMemberships.map((entry) => entry.identity.id));
    return (availableIdentities ?? []).filter((identity) => !existing.has(identity.id));
  }, [isAgentVault, agentVaultAssignable, availableIdentities, members]);

  const [mode, setMode] = useState<AddIdentityMode>();
  const currentMode = mode ?? (assignable.length > 0 ? "assign" : "create");
  const [name, setName] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [role, setRole] = useState<string>(
    isAgentVault || scope.projectType === ProjectType.CertificateManager
      ? ProjectMembershipRole.Member
      : ProjectMembershipRole.NoAccess
  );
  const [errors, setErrors] = useState<{ name?: string; identity?: string }>({});

  const submit = async () => {
    if (currentMode === "create" && !name.trim()) {
      setErrors({ name: "Required" });
      return;
    }
    if (currentMode === "assign" && !identityId) {
      setErrors({ identity: "Required" });
      return;
    }
    setPending(true);
    const grantTemplates = async (targetId: string) => {
      if (!templateIds.length || !canGrantPrivileges) return true;
      try {
        await createPrivilege.mutateAsync({
          identityId: targetId,
          projectId,
          permissions: templatePermissions(scope.projectType, templateIds),
          type: { isTemporary: false }
        });
        return true;
      } catch {
        return false;
      }
    };
    const grantFailed = (verb: string) =>
      toast({
        tone: "bad",
        title: `Machine identity ${verb}, but applying the policy grant failed`,
        description: "You can add it from the identity page."
      });
    try {
      if (isAgentVault) {
        if (currentMode === "assign") {
          await addAgentVaultMembers.mutateAsync({ machineIdentityIds: [identityId], role });
          saved("Successfully added machine identity");
          onClose();
          return;
        }
        const created = await createAgentVaultIdentity.mutateAsync({ name: name.trim(), role });
        if (created.authAttachFailed)
          toast({
            tone: "bad",
            title: "Machine identity created, but attaching Universal Auth failed",
            description: "Add an auth method from the identity page."
          });
        else saved("Successfully created machine identity");
        onClose();
        go(accessLinks.projectIdentity(scope, created.id));
        return;
      }
      if (currentMode === "assign") {
        await addMembership.mutateAsync({
          projectId,
          projectType: scope.projectType,
          identityId,
          role: role || undefined
        });
        if (await grantTemplates(identityId)) saved("Successfully added machine identity");
        else grantFailed("added");
        onClose();
        return;
      }
      const created = await createIdentity.mutateAsync({
        projectId,
        name: name.trim(),
        hasDeleteProtection: true
      });
      if (role)
        await updateRoles.mutateAsync({
          projectId,
          projectType: scope.projectType,
          identityId: created.id,
          roles: [{ role }]
        });
      try {
        await addUniversalAuth.mutateAsync({
          projectId,
          identityId: created.id,
          ...UNIVERSAL_AUTH_DEFAULTS
        });
      } catch {
        toast({
          tone: "bad",
          title: "Machine identity created, but attaching Universal Auth failed",
          description: "Add an auth method from the identity page."
        });
      }
      if (await grantTemplates(created.id)) saved("Successfully created machine identity");
      else grantFailed("created");
      onClose();
      go(accessLinks.projectIdentity(scope, created.id));
    } catch (error) {
      failed(
        currentMode === "assign"
          ? "Failed to add machine identity"
          : "Failed to create machine identity",
        error
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <SheetBody>
        <form
          id="add-project-identity"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Stack gap={8}>
              <Tabs
                variant="segmented"
                label="Identity assignment mode"
                value={currentMode}
                onChange={(next) => {
                  setMode(next as AddIdentityMode);
                  setErrors({});
                  if (next === "create") setIdentityId("");
                  else setName("");
                }}
                tabs={[
                  { value: "create", label: "Create new" },
                  { value: "assign", label: "Assign existing" }
                ]}
              />
              <Muted>
                {currentMode === "assign"
                  ? "Reuse an organization machine identity across projects."
                  : `Creates a machine identity that belongs to ${accessThis(scope.projectType)} only.`}
              </Muted>
            </Stack>
            {currentMode === "create" ? (
              <Field label="Name" error={errors.name}>
                <Input
                  autoFocus
                  placeholder="Machine 1"
                  autoComplete="off"
                  name="project-identity-name"
                  value={name}
                  invalid={Boolean(errors.name)}
                  onChange={(event) => {
                    setName(event.target.value);
                    setErrors({});
                  }}
                />
              </Field>
            ) : (
              <Field label="Machine identity" error={errors.identity}>
                <Combobox
                  label="Machine identity"
                  placeholder="Select machine identity..."
                  emptyText="No machine identities available"
                  options={assignable.map((identity) => ({
                    value: identity.id,
                    label: identity.name
                  }))}
                  value={identityId}
                  invalid={Boolean(errors.identity)}
                  onChange={(value) => {
                    setIdentityId(value);
                    setErrors({});
                  }}
                />
              </Field>
            )}
            <Field label="Role">
              <Combobox
                label="Role"
                placeholder="Select role..."
                options={(roles ?? []).map((item) => ({
                  value: item.slug,
                  label: item.name,
                  meta: item.description || undefined
                }))}
                value={role}
                onChange={(value) => value && setRole(value)}
              />
            </Field>
            {canGrantPrivileges && templates.length > 0 && (
              <Field label="Additional privileges" optional>
                <Combobox
                  multiple
                  label="Additional privileges"
                  placeholder="Select additional privileges..."
                  options={templates.map((template) => ({
                    value: template.id,
                    label: template.name,
                    description: template.description
                  }))}
                  value={templateIds}
                  onChange={setTemplateIds}
                />
              </Field>
            )}
          </Stack>
        </form>
      </SheetBody>
      <SheetFooter>
        <Inline gap={8} justify="end">
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="add-project-identity" loading={pending}>
            {currentMode === "assign" ? "Add" : "Create"}
          </Button>
        </Inline>
      </SheetFooter>
    </>
  );
};

export const AddProjectIdentitySheet = ({
  projectId,
  open,
  onOpenChange
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const scope = useProjectScope();
  const [pending, setPending] = useState(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent pending={pending}>
        <SheetHeader>
          <SheetTitle>{`Add machine identity to ${accessNoun(scope.projectType)}`}</SheetTitle>
        </SheetHeader>
        {open && (
          <AddIdentityForm
            projectId={projectId}
            pending={pending}
            setPending={setPending}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
