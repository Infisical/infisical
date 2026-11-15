import { useEffect, useState } from "react";
import { Combobox, type ComboboxCreationFormProps } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Tabs } from "@infisical/cipher/ui/tabs";

import { AGENT_VAULT_PRODUCT_ROLE_OPTIONS } from "@app/helpers/roles";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

type TMode = "create" | "assign";

type TDraft = { mode?: TMode; name: string; identityId: string; role: string };

type TErrors = Partial<Record<"name" | "identityId", string>>;

export type TCreatedIdentity = { id: string; name: string; role?: string };

const ROLE_OPTIONS = AGENT_VAULT_PRODUCT_ROLE_OPTIONS.map(({ value, label, description }) => ({
  value,
  label,
  description
}));

export const CreateIdentityForm = ({
  projectId,
  query,
  formId,
  complete,
  onDirtyChange,
  onPendingChange,
  onSubmitLabelChange,
  onCreated
}: ComboboxCreationFormProps & {
  projectId: string;
  onCreated: (identity: TCreatedIdentity) => void;
}) => {
  const agentVault = useV4Adapter("agentVault");
  const { data: assignable } = agentVault.useAssignableIdentities(projectId, true);
  const createIdentity = agentVault.useCreateManagedIdentity(projectId);
  const addMembers = agentVault.useAddMembers(projectId);

  const [draft, setDraft] = useState<TDraft>({
    name: query,
    identityId: "",
    role: ProjectMembershipRole.Member
  });
  const [errors, setErrors] = useState<TErrors>({});

  let defaultMode: TMode | undefined;
  if (assignable) defaultMode = assignable.length && !query ? "assign" : "create";
  const mode = draft.mode ?? defaultMode;

  const edit = (patch: Partial<TDraft>, cleared?: keyof TErrors) => {
    setDraft((prev) => ({ ...prev, mode: prev.mode ?? mode, ...patch }));
    if (cleared) setErrors((prev) => ({ ...prev, [cleared]: undefined }));
  };

  const isDirty =
    draft.role !== ProjectMembershipRole.Member ||
    (mode === "assign" ? Boolean(draft.identityId) : draft.name.trim() !== query);
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);
  useEffect(
    () => onSubmitLabelChange(mode === "assign" ? "Add" : undefined),
    [mode, onSubmitLabelChange]
  );

  const submit = async () => {
    const name = draft.name.trim();
    const picked = assignable?.find((identity) => identity.id === draft.identityId);
    if (mode === "create" && !name) {
      setErrors({ name: "Enter a name" });
      return;
    }
    if (mode === "assign" && !picked) {
      setErrors({ identityId: "Pick a machine identity" });
      return;
    }
    edit({});
    onPendingChange(true);
    try {
      if (mode === "create") {
        const created = await createIdentity.mutateAsync({ name, role: draft.role });
        if (created.authAttachFailed)
          toast({
            tone: "bad",
            title: "Machine identity created, but attaching Universal Auth failed",
            description: "Add an auth method from the identity page."
          });
        else saved("Machine identity created");
        onCreated({ id: created.id, name: created.name, role: draft.role });
        complete({ value: created.id, label: created.name });
        return;
      }
      if (!picked) return;
      const { members } = await addMembers.mutateAsync({
        machineIdentityIds: [picked.id],
        role: draft.role
      });
      const added = members.find((member) => member.id === picked.id);
      saved(added ? "Machine identity added" : "Machine identity was already a member");
      onCreated({ ...picked, role: added?.role });
      complete({ value: picked.id, label: picked.name });
    } catch (cause) {
      failed(
        mode === "create" ? "Couldn't create machine identity" : "Couldn't add machine identity",
        cause
      );
    } finally {
      onPendingChange(false);
    }
  };

  if (!mode)
    return (
      <Stack gap={16}>
        <Skeleton width={220} height={32} />
        <Skeleton width="100%" height={56} />
        <Skeleton width="100%" height={56} />
      </Stack>
    );

  return (
    <form
      id={formId}
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Stack gap={16}>
        <Tabs
          variant="segmented"
          label="Identity assignment mode"
          value={mode}
          onValueChange={(next) => {
            edit({ mode: next as TMode });
            setErrors({});
          }}
          tabs={[
            { value: "create", label: "Create new" },
            { value: "assign", label: "Assign existing" }
          ]}
        />
        {mode === "create" ? (
          <Field
            label="Name"
            error={errors.name}
            description="A machine identity managed by Agent Vault, with Universal Auth attached."
          >
            <Input
              placeholder="ci-release-agent"
              value={draft.name}
              invalid={Boolean(errors.name)}
              onChange={(event) => edit({ name: event.target.value }, "name")}
            />
          </Field>
        ) : (
          <Field
            label="Machine identity"
            error={errors.identityId}
            description="An organization machine identity, which can be added to several projects."
          >
            <Combobox
              label="Machine identity"
              placeholder="Pick a machine identity"
              emptyText="No machine identity can be added."
              options={(assignable ?? []).map((identity) => ({
                value: identity.id,
                label: identity.name
              }))}
              value={draft.identityId}
              invalid={Boolean(errors.identityId)}
              onChange={(identityId) => edit({ identityId }, "identityId")}
            />
          </Field>
        )}
        <Field label="Role">
          <Select
            label="Role"
            value={draft.role}
            options={ROLE_OPTIONS}
            onChange={(role) => edit({ role })}
          />
        </Field>
      </Stack>
    </form>
  );
};
