import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import {
  Combobox,
  type ComboboxCreation,
  type ComboboxOption
} from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Tabs } from "@infisical/cipher/ui/tabs";

import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { AGENT_VAULT_PRODUCT_ROLE_OPTIONS } from "@app/helpers/roles";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { useProjectPermission } from "../../access/permissions";
import { readableFailure, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

type TMode = "create" | "assign";

type TDraft = { mode?: TMode; name: string; identityId: string; role: string };

export type TCreatedIdentity = { id: string; name: string; role?: string };

type TIdentityCreation = { query: string; complete: (option: ComboboxOption) => void };

const ROLE_OPTIONS = AGENT_VAULT_PRODUCT_ROLE_OPTIONS.map(({ value, label, description }) => ({
  value,
  label,
  description
}));

export const CreateIdentityDialog = ({
  projectId,
  creation: { query, complete },
  onCreated,
  onClose
}: {
  projectId: string;
  creation: TIdentityCreation;
  onCreated: (identity: TCreatedIdentity) => void;
  onClose: () => void;
}) => {
  const agentVault = useV4Adapter("agentVault");
  const { data: assignable } = agentVault.useAssignableIdentities(projectId, true);
  const createIdentity = agentVault.useCreateManagedIdentity(projectId);
  const addMembers = agentVault.useAddMembers(projectId);
  const completed = useRef(false);

  const [draft, setDraft] = useState<TDraft>({
    name: query,
    identityId: "",
    role: ProjectMembershipRole.Member
  });

  let defaultMode: TMode | undefined;
  if (assignable) defaultMode = assignable.length && !query ? "assign" : "create";
  const mode = draft.mode ?? defaultMode;

  const edit = (patch: Partial<TDraft>) =>
    setDraft((prev) => ({ ...prev, mode: prev.mode ?? mode, ...patch }));

  const isDirty =
    draft.role !== ProjectMembershipRole.Member ||
    (mode === "assign" ? Boolean(draft.identityId) : draft.name.trim() !== query);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty,
    onDiscard: onClose
  });

  const picked = assignable?.find((identity) => identity.id === draft.identityId);

  const submit = async () => {
    if (mode === "create") {
      const created = await createIdentity
        .mutateAsync({ name: draft.name.trim(), role: draft.role })
        .catch(readableFailure("Couldn't create machine identity"));
      if (created.authAttachFailed)
        toast({
          tone: "bad",
          title: "Machine identity created, but attaching Universal Auth failed",
          description: "Add an auth method from the identity page."
        });
      else saved("Machine identity created");
      completed.current = true;
      onCreated({ id: created.id, name: created.name, role: draft.role });
      complete({ value: created.id, label: created.name });
      return;
    }
    if (!picked) return;
    const { members } = await addMembers
      .mutateAsync({ machineIdentityIds: [picked.id], role: draft.role })
      .catch(readableFailure("Couldn't add machine identity"));
    const added = members.find((member) => member.id === picked.id);
    saved(added ? "Machine identity added" : "Machine identity was already a member");
    completed.current = true;
    onCreated({ ...picked, role: added?.role });
    complete({ value: picked.id, label: picked.name });
  };

  return (
    <div onSubmit={(event) => event.stopPropagation()}>
      <MultiStep
        variant="dialog"
        open
        onOpenChange={(open) => {
          if (open) return;
          if (completed.current) onClose();
          else requestDiscard();
        }}
        title="Add machine identity to Agent Vault"
        completeLabel={mode === "assign" ? "Add" : "Create"}
        onComplete={submit}
        steps={[
          {
            title: "Machine identity",
            disabledReason: mode ? undefined : "Loading machine identities",
            validate: () => {
              if (mode === "create" && !draft.name.trim())
                return { fields: { name: "Enter a name" } };
              if (mode === "assign" && !picked)
                return { fields: { identityId: "Pick a machine identity" } };
              return true;
            },
            content: mode ? (
              <Stack gap={16}>
                <Tabs
                  variant="segmented"
                  label="Identity assignment mode"
                  value={mode}
                  onValueChange={(next) => edit({ mode: next as TMode })}
                  tabs={[
                    { value: "create", label: "Create new" },
                    { value: "assign", label: "Assign existing" }
                  ]}
                />
                {mode === "create" ? (
                  <Field
                    label="Name"
                    name="name"
                    description="A machine identity managed by Agent Vault, with Universal Auth attached."
                  >
                    <Input
                      placeholder="ci-release-agent"
                      value={draft.name}
                      onChange={(event) => edit({ name: event.target.value })}
                    />
                  </Field>
                ) : (
                  <Field
                    label="Machine identity"
                    name="identityId"
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
                      onChange={(identityId) => edit({ identityId })}
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
            ) : (
              <Stack gap={16}>
                <Skeleton width={220} height={32} />
                <Skeleton width="100%" height={56} />
                <Skeleton width="100%" height={56} />
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog {...discardDialogProps} title="Discard this machine identity?" />
    </div>
  );
};

export const useIdentityCreation = (
  projectId: string,
  onCreated: (identity: TCreatedIdentity) => void
) => {
  const { permission } = useProjectPermission(projectId);
  const [creation, setCreation] = useState<TIdentityCreation | null>(null);
  const canCreate = permission.can(
    ProjectPermissionIdentityActions.Create,
    ProjectPermissionSub.Identity
  );
  return {
    creation: canCreate
      ? ({
          mode: "action",
          label: "Create machine identity",
          onSelect: setCreation
        } satisfies ComboboxCreation)
      : undefined,
    dialog: creation && (
      <CreateIdentityDialog
        projectId={projectId}
        creation={creation}
        onCreated={onCreated}
        onClose={() => setCreation(null)}
      />
    )
  };
};
