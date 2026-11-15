import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Combobox, type ComboboxCreationFormProps } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { z } from "zod";

import { AGENT_VAULT_PRODUCT_ROLE_OPTIONS } from "@app/helpers/roles";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

const formSchema = z
  .object({
    mode: z.enum(["create", "assign"]).optional(),
    name: z.string().trim(),
    identityId: z.string(),
    role: z.string().min(1)
  })
  .superRefine((values, ctx) => {
    if (values.mode === "assign" && !values.identityId)
      ctx.addIssue({ code: "custom", path: ["identityId"], message: "Pick a machine identity" });
    if (values.mode !== "assign" && !values.name)
      ctx.addIssue({ code: "custom", path: ["name"], message: "Enter a name" });
  });

type TFormValues = z.infer<typeof formSchema>;
type TMode = NonNullable<TFormValues["mode"]>;

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

  const { control, handleSubmit, setValue, clearErrors } = useForm<TFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: query, identityId: "", role: ProjectMembershipRole.Member }
  });
  const [pickedMode, name, identityId] = useWatch({
    control,
    name: ["mode", "name", "identityId"]
  });
  let defaultMode: TMode | undefined;
  if (assignable) defaultMode = assignable.length && !query ? "assign" : "create";
  const mode = pickedMode ?? defaultMode;
  const lockMode = () => {
    if (!pickedMode && mode) setValue("mode", mode);
  };

  const isDirty = mode === "assign" ? Boolean(identityId) : name.trim() !== query;
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);
  useEffect(
    () => onSubmitLabelChange(mode === "assign" ? "Add" : undefined),
    [mode, onSubmitLabelChange]
  );

  const submit = async (values: TFormValues) => {
    const isCreate = values.mode !== "assign";
    const picked = assignable?.find((identity) => identity.id === values.identityId);
    if (!isCreate && !picked) return;
    onPendingChange(true);
    try {
      if (isCreate) {
        const created = await createIdentity.mutateAsync({ name: values.name, role: values.role });
        if (created.authAttachFailed)
          toast({
            tone: "bad",
            title: "Machine identity created, but attaching Universal Auth failed",
            description: "Add an auth method from the identity page."
          });
        else saved("Machine identity created");
        onCreated({ id: created.id, name: created.name, role: values.role });
        complete({ value: created.id, label: created.name });
        return;
      }
      if (!picked) return;
      await addMembers.mutateAsync({ machineIdentityIds: [picked.id], role: values.role });
      saved("Machine identity added");
      onCreated({ ...picked, role: values.role });
      complete({ value: picked.id, label: picked.name });
    } catch (cause) {
      failed(
        isCreate ? "Failed to create machine identity" : "Failed to add machine identity",
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
        lockMode();
        handleSubmit(submit)(event).catch(() => {});
      }}
    >
      <Stack gap={16}>
        <Tabs
          variant="segmented"
          label="Identity assignment mode"
          value={mode}
          onValueChange={(next) => {
            setValue("mode", next as TMode);
            clearErrors();
          }}
          tabs={[
            { value: "create", label: "Create new" },
            { value: "assign", label: "Assign existing" }
          ]}
        />
        {mode === "create" ? (
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <Field
                label="Name"
                error={fieldState.error?.message}
                description="A machine identity managed by Agent Vault, with Universal Auth attached."
              >
                <Input
                  {...field}
                  onChange={(event) => {
                    lockMode();
                    field.onChange(event);
                  }}
                  placeholder="ci-release-agent"
                  invalid={Boolean(fieldState.error)}
                />
              </Field>
            )}
          />
        ) : (
          <Controller
            control={control}
            name="identityId"
            render={({ field, fieldState }) => (
              <Field
                label="Machine identity"
                error={fieldState.error?.message}
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
                  value={field.value}
                  invalid={Boolean(fieldState.error)}
                  onChange={(value) => {
                    lockMode();
                    field.onChange(value);
                  }}
                />
              </Field>
            )}
          />
        )}
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <Field label="Role">
              <Select
                label="Role"
                value={field.value}
                options={ROLE_OPTIONS}
                onChange={field.onChange}
              />
            </Field>
          )}
        />
      </Stack>
    </form>
  );
};
