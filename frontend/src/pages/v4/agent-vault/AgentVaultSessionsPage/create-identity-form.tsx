import { useEffect, useState } from "react";
import { Combobox, type ComboboxCreationFormProps } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Tabs } from "@infisical/cipher/ui/tabs";

import { AGENT_VAULT_PRODUCT_ROLE_OPTIONS } from "@app/helpers/roles";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

type TMode = "create" | "assign";

export type TCreatedIdentity = { id: string; name: string; role: string };

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

  const [pickedMode, setPickedMode] = useState<TMode>();
  const mode = pickedMode ?? (assignable?.length && !query ? "assign" : "create");
  const [name, setName] = useState(query);
  const [identityId, setIdentityId] = useState("");
  const [role, setRole] = useState<string>(ProjectMembershipRole.Member);
  const [error, setError] = useState<string>();

  const isDirty = mode === "create" ? name.trim() !== query : Boolean(identityId);
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);
  useEffect(
    () => onSubmitLabelChange(mode === "assign" ? "Add" : undefined),
    [mode, onSubmitLabelChange]
  );

  const submit = async () => {
    if (mode === "create" && !name.trim()) {
      setError("Enter a name");
      return;
    }
    const picked = assignable?.find((identity) => identity.id === identityId);
    if (mode === "assign" && !picked) {
      setError("Pick a machine identity");
      return;
    }
    onPendingChange(true);
    try {
      if (mode === "create") {
        const created = await createIdentity.mutateAsync({ name: name.trim(), role });
        if (created.authAttachFailed)
          toast({
            tone: "bad",
            title: "Machine identity created, but attaching Universal Auth failed",
            description: "Add an auth method from the identity page."
          });
        else saved("Machine identity created");
        onCreated({ id: created.id, name: created.name, role });
        complete({ value: created.id, label: created.name });
        return;
      }
      if (!picked) return;
      await addMembers.mutateAsync({ machineIdentityIds: [picked.id], role });
      saved("Machine identity added");
      onCreated({ ...picked, role });
      complete({ value: picked.id, label: picked.name });
    } catch (cause) {
      failed(
        mode === "create" ? "Failed to create machine identity" : "Failed to add machine identity",
        cause
      );
    } finally {
      onPendingChange(false);
    }
  };

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
            setPickedMode(next as TMode);
            setError(undefined);
          }}
          tabs={[
            { value: "create", label: "Create new" },
            { value: "assign", label: "Assign existing" }
          ]}
        />
        {mode === "create" ? (
          <Field
            label="Name"
            error={error}
            description="A machine identity managed by Agent Vault, with Universal Auth attached."
          >
            <Input
              placeholder="ci-release-agent"
              value={name}
              invalid={Boolean(error)}
              onChange={(event) => {
                setName(event.target.value);
                setError(undefined);
              }}
            />
          </Field>
        ) : (
          <Field
            label="Machine identity"
            error={error}
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
              value={identityId}
              invalid={Boolean(error)}
              onChange={(value) => {
                setIdentityId(value);
                setError(undefined);
              }}
            />
          </Field>
        )}
        <Field label="Role">
          <Select label="Role" value={role} options={ROLE_OPTIONS} onChange={setRole} />
        </Field>
      </Stack>
    </form>
  );
};
