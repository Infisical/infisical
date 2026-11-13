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

import { UNIVERSAL_AUTH_DEFAULTS } from "@app/hooks/api/identities/constants";
import { SearchIdentitiesScope } from "@app/hooks/api/identities/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { failed, saved, toast } from "../toast";
import { Muted } from "../ui";
import { accessNoun, accessThis } from "./product";
import { useProjectScope } from "./scope";

export type AddIdentityMode = "create" | "assign";

const AddIdentityForm = ({
  orgId,
  projectId,
  pending,
  setPending,
  onClose
}: {
  orgId: string;
  projectId: string;
  pending: boolean;
  setPending: (pending: boolean) => void;
  onClose: () => void;
}) => {
  const scope = useProjectScope();
  const access = useV4Adapter("access");
  const go = useGo();
  const { data: roles } = access.useProjectRoles(projectId, scope.projectType);
  const { data: orgIdentities } = access.useSearchOrgIdentities({
    orgId,
    offset: 0,
    limit: 100,
    scope: [SearchIdentitiesScope.OrganizationScope],
    search: {}
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

  const assignable = useMemo(() => {
    const existing = new Set(members?.identityMemberships.map((entry) => entry.identity.id));
    return (orgIdentities?.identities ?? []).filter((row) => !existing.has(row.identity.id));
  }, [orgIdentities, members]);

  const [mode, setMode] = useState<AddIdentityMode>();
  const currentMode = mode ?? (assignable.length > 0 ? "assign" : "create");
  const [name, setName] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [role, setRole] = useState<string>(ProjectMembershipRole.NoAccess);
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
    try {
      if (currentMode === "assign") {
        await addMembership.mutateAsync({
          projectId,
          projectType: scope.projectType,
          identityId,
          role: role || undefined
        });
        saved("Successfully added machine identity");
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
        saved("Successfully created machine identity");
      } catch {
        toast({
          tone: "bad",
          title: "Machine identity created, but attaching Universal Auth failed",
          description: "Add an auth method from the identity page."
        });
      }
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
                  options={assignable.map((row) => ({
                    value: row.identity.id,
                    label: row.identity.name
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
  orgId,
  projectId,
  open,
  onOpenChange
}: {
  orgId: string;
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
            orgId={orgId}
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
