import { ReactNode, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { CustomRolesUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import { createNotification } from "@app/components/notifications";
import { RoleOptionContent } from "@app/components/roles";
import {
  Button,
  Combobox,
  ComboboxActionCreationConfig,
  ComboboxSheetCreationConfig,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  SheetFooter
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { useScopeVariant } from "@app/hooks";
import { useCreateProjectRole, useGetProjectRoleBySlug, useGetProjectRoles } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { TProjectRole } from "@app/hooks/api/roles/types";
import { slugSchema } from "@app/lib/schemas";

import { sanitizeDuplicateRolePermissions } from "./DuplicateProjectRoleModal.utils";

const schema = z.object({
  name: z.string().trim().min(1, "Name required"),
  description: z.string(),
  slug: slugSchema({ min: 1 }),
  copyFrom: z.string().nullable()
});

type FormData = z.infer<typeof schema>;

type FormProps = {
  initialName: string;
  isPending: boolean;
  onSubmit: (
    form: Omit<FormData, "copyFrom">,
    permissions: TProjectRole["permissions"]
  ) => Promise<void>;
  onCancel: VoidFunction;
};

const CreateCustomRoleForm = ({ initialName, isPending, onSubmit, onCancel }: FormProps) => {
  const scopeVariant = useScopeVariant();
  const { currentProject } = useProject();
  const { data: roles = [] } = useGetProjectRoles(currentProject.id, currentProject.type);

  const {
    control,
    handleSubmit,
    setValue,
    getFieldState,
    watch,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialName,
      description: "",
      slug: slugify(initialName, { lowercase: true }),
      copyFrom: null
    }
  });

  const { data: sourceRole, isFetching: isSourceRoleLoading } = useGetProjectRoleBySlug(
    currentProject.id,
    watch("copyFrom") ?? "",
    currentProject.type
  );

  return (
    <form
      onSubmit={(e) => {
        e.stopPropagation();
        return handleSubmit(({ copyFrom, ...form }) =>
          onSubmit(
            form,
            copyFrom && sourceRole ? sanitizeDuplicateRolePermissions(sourceRole.permissions) : []
          )
        )(e);
      }}
      autoComplete="off"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-0 thin-scrollbar flex-1 flex-col overflow-y-auto p-4">
        <FieldGroup>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="create-custom-role-name">Name</FieldLabel>
                <Input
                  {...field}
                  id="create-custom-role-name"
                  placeholder="Billing Team"
                  autoComplete="off"
                  data-1p-ignore
                  isError={Boolean(error)}
                  onChange={(e) => {
                    onChange(e);
                    if (getFieldState("slug").isDirty) return;
                    setValue("slug", slugify(e.target.value, { lowercase: true }), {
                      shouldValidate: true
                    });
                  }}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="slug"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="create-custom-role-slug">Slug</FieldLabel>
                <Input
                  {...field}
                  id="create-custom-role-slug"
                  placeholder="billing"
                  autoComplete="off"
                  data-1p-ignore
                  isError={Boolean(error)}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="create-custom-role-description">Description</FieldLabel>
                <Input
                  {...field}
                  id="create-custom-role-description"
                  placeholder="Manage billing settings"
                  autoComplete="off"
                  data-1p-ignore
                  isError={Boolean(error)}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="copyFrom"
            render={({ field: { value, onChange } }) => (
              <Field>
                <FieldLabel>Copy Permissions From</FieldLabel>
                <Combobox
                  options={roles}
                  value={roles.find((role) => role.slug === value) ?? null}
                  onValueChange={(role) => onChange(role?.slug ?? null)}
                  placeholder="Start with no permissions"
                  searchAriaLabel="Search roles"
                  getOptionValue={(role) => role.slug}
                  getOptionKeywords={(role) => [role.slug]}
                  getOptionLabel={(role) => role.name}
                  renderOption={(role) => (
                    <RoleOptionContent
                      role={{ name: role.name, description: role.description ?? undefined }}
                    />
                  )}
                />
              </Field>
            )}
          />
        </FieldGroup>
      </div>
      <SheetFooter className="justify-end border-t">
        <Button variant="ghost" type="button" isDisabled={isPending} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={scopeVariant}
          isPending={isPending || isSubmitting}
          isDisabled={isPending || isSourceRoleLoading}
        >
          Create Role
        </Button>
      </SheetFooter>
    </form>
  );
};

/**
 * The "Create Custom Role" row of a project role picker, for whoever can create roles. Without custom roles on the
 * plan the row opens the upgrade dialog, which the caller renders from `upgradeGate`.
 */
export const useProjectRoleCreation = <TOption,>(
  onCreated: (role: TProjectRole) => void
): {
  creation:
    | ComboboxSheetCreationConfig<TOption>
    | ComboboxActionCreationConfig<TOption>
    | undefined;
  upgradeGate: ReactNode;
} => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const [isUpgradeGateOpen, setIsUpgradeGateOpen] = useState(false);
  const { mutateAsync: createProjectRole, isPending } = useCreateProjectRole();

  const canCreateRole =
    currentProject.type === ProjectType.SecretManager &&
    permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Role);
  if (!canCreateRole) return { creation: undefined, upgradeGate: null };

  const label = "Create Custom Role";

  if (!subscription.rbac) {
    return {
      creation: {
        mode: "action",
        emptyLabel: label,
        formatLabel: () => label,
        onAction: () => setIsUpgradeGateOpen(true)
      },
      upgradeGate: (
        <UpgradeGate
          paywallKey="project.role"
          isOpen={isUpgradeGateOpen}
          onOpenChange={setIsUpgradeGateOpen}
          intent={{ ...CustomRolesUpgradeIntent, isEnterpriseFeature: false }}
        />
      )
    };
  }

  return {
    creation: {
      mode: "sheet",
      title: label,
      description: "The new role is selected once it is created.",
      emptyLabel: label,
      formatLabel: () => label,
      isPending,
      renderForm: ({ initialInput, complete, cancel }) => (
        <CreateCustomRoleForm
          initialName={initialInput}
          isPending={isPending}
          onCancel={cancel}
          onSubmit={async (form, permissions) => {
            const role = await createProjectRole({
              projectId: currentProject.id,
              permissions,
              ...form
            });
            createNotification({ type: "success", text: `Project role "${role.name}" created` });
            onCreated(role);
            complete();
          }}
        />
      )
    },
    upgradeGate: null
  };
};
