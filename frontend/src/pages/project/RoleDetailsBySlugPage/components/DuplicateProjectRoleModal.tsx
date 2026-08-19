import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton
} from "@app/components/v3";
import { ProjectPermissionSub, useOrganization, useProject, useSubscription } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { getProjectBaseURL } from "@app/helpers/project";
import { useCreateProjectRole, useGetProjectRoleBySlug } from "@app/hooks/api";
import { TProjectRole } from "@app/hooks/api/roles/types";
import { usePopUp } from "@app/hooks/usePopUp";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  roleSlug?: string;
};

const schema = z
  .object({
    name: z.string().min(1, "Name required"),
    description: z.string(),
    slug: slugSchema({ min: 1 })
  })
  .required();

export type FormData = z.infer<typeof schema>;

type ContentProps = {
  role: TProjectRole;
  onClose: () => void;
};

const Content = ({ role, onClose }: ContentProps) => {
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    defaultValues: {
      name: `${role.name} Duplicate`,
      description: "",
      slug: ""
    },
    resolver: zodResolver(schema)
  });

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const {
    popUp: upgradePlanPopUp,
    handlePopUpOpen: handleUpgradePlanPopUpOpen,
    handlePopUpToggle: handleUpgradePlanPopUpToggle
  } = usePopUp(["upgradePlan"] as const);

  const createRole = useCreateProjectRole();
  const navigate = useNavigate();

  const handleDuplicateRole = async (form: FormData) => {
    if (subscription && !subscription.rbac) {
      handleUpgradePlanPopUpOpen("upgradePlan");
      return;
    }

    const sanitizedPermission = role.permissions.map((permission) => {
      if (
        permission.subject === ProjectPermissionSub.Secrets &&
        (permission.action.includes(ProjectPermissionSecretActions.DescribeSecret) ||
          permission.action.includes(ProjectPermissionSecretActions.ReadValue))
      ) {
        return {
          ...permission,
          action: (permission.action as string[])?.filter(
            (action) => action !== ProjectPermissionSecretActions.DescribeAndReadValue
          )
        };
      }
      return permission;
    });

    const newRole = await createRole.mutateAsync({
      projectId: currentProject.id,
      permissions: sanitizedPermission,
      ...form
    });

    createNotification({
      type: "success",
      text: `Project role "${form.name}" duplicated`
    });

    navigate({
      to: `${getProjectBaseURL(currentProject.type)}/roles/$roleSlug` as const,
      params: {
        orgId: currentOrg.id,
        roleSlug: newRole.slug,
        projectId: currentProject.id
      }
    });

    onClose();
  };

  return (
    <>
      <form onSubmit={handleSubmit(handleDuplicateRole)} className="flex min-h-0 flex-1 flex-col">
        <SheetHeader>
          <SheetTitle>Duplicate Role</SheetTitle>
          <SheetDescription>
            Create a new role with the same permissions as {role.name}.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 thin-scrollbar flex-1 flex-col overflow-y-auto p-4">
          <FieldGroup>
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="duplicate-project-role-name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="duplicate-project-role-name"
                    placeholder="Billing Team"
                    isError={Boolean(error)}
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
                  <FieldLabel htmlFor="duplicate-project-role-slug">Slug</FieldLabel>
                  <Input
                    {...field}
                    id="duplicate-project-role-slug"
                    placeholder="billing"
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
                  <FieldLabel htmlFor="duplicate-project-role-description">Description</FieldLabel>
                  <Input
                    {...field}
                    id="duplicate-project-role-description"
                    placeholder="Manage billing settings"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
          </FieldGroup>
        </div>
        <SheetFooter className="border-t">
          <SheetClose asChild>
            <Button variant="ghost" isDisabled={isSubmitting}>
              Cancel
            </Button>
          </SheetClose>
          <Button type="submit" variant="project" isPending={isSubmitting}>
            Duplicate Role
          </Button>
        </SheetFooter>
      </form>
      <UpgradePlanModal
        isOpen={upgradePlanPopUp.upgradePlan.isOpen}
        onOpenChange={(open) => handleUpgradePlanPopUpToggle("upgradePlan", open)}
        text="Your current plan does not include custom roles. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature
      />
    </>
  );
};

export const DuplicateProjectRoleModal = ({ isOpen, onOpenChange, roleSlug }: Props) => {
  const { currentProject } = useProject();
  const { data: role, isPending } = useGetProjectRoleBySlug(currentProject.id, roleSlug ?? "");

  if (!roleSlug) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent>
        {/* eslint-disable-next-line no-nested-ternary */}
        {isPending ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <SheetHeader>
              <SheetTitle>Duplicate Role</SheetTitle>
              <SheetDescription>
                Create a new role with the same permissions as the selected role.
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 p-4" aria-label="Loading role" aria-busy="true">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          </div>
        ) : role ? (
          <Content role={role} onClose={() => onOpenChange(false)} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <SheetHeader>
              <SheetTitle>Duplicate Role</SheetTitle>
              <SheetDescription>We could not load the selected role.</SheetDescription>
            </SheetHeader>
            <p className="p-4 text-sm text-danger">
              Could not find a role with the slug &quot;{roleSlug}&quot;.
            </p>
            <SheetFooter className="border-t">
              <SheetClose asChild>
                <Button variant="ghost">Close</Button>
              </SheetClose>
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
