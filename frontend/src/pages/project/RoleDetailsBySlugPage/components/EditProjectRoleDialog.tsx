import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useOrganization, useProject, useSubscription } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { useUpdateProjectRole } from "@app/hooks/api";
import { TProjectRole } from "@app/hooks/api/roles/types";
import { slugSchema } from "@app/lib/schemas";

const schema = z
  .object({
    name: z.string().min(1, "Name required"),
    description: z.string(),
    slug: slugSchema({ min: 1 })
  })
  .required();

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  role?: TProjectRole;
  onOpenChange: (isOpen: boolean) => void;
};

export const EditProjectRoleDialog = ({ isOpen, role, onOpenChange }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const { mutateAsync: updateProjectRole } = useUpdateProjectRole();
  const {
    popUp: upgradePlanPopUp,
    handlePopUpOpen: handleUpgradePlanPopUpOpen,
    handlePopUpToggle: handleUpgradePlanPopUpToggle
  } = usePopUp(["upgradePlan"] as const);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      slug: ""
    }
  });

  useEffect(() => {
    if (!role) return;
    reset({
      name: role.name,
      description: role.description || "",
      slug: role.slug
    });
  }, [role, reset]);

  const onSubmit = async ({ name, description, slug }: FormData) => {
    if (!currentProject?.id || !role) return;

    if (subscription && !subscription.rbac) {
      handleUpgradePlanPopUpOpen("upgradePlan");
      return;
    }

    await updateProjectRole({
      id: role.id,
      projectId: currentProject.id,
      projectType: currentProject.type,
      name,
      description,
      slug
    });

    onOpenChange(false);
    navigate({
      to: `${getProjectBaseURL(currentProject.type)}/roles/$roleSlug` as const,
      params: {
        orgId: currentOrg?.id || "",
        roleSlug: slug,
        projectId: currentProject.id
      }
    });
    createNotification({
      text: `Project role "${name}" updated`,
      type: "success"
    });
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          onOpenChange(open);
          if (!open && role) {
            reset({
              name: role.name,
              description: role.description || "",
              slug: role.slug
            });
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>Update the role name, slug, and description.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FieldGroup>
              <Controller
                control={control}
                name="name"
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="edit-project-role-name">Name</FieldLabel>
                    <Input
                      {...field}
                      id="edit-project-role-name"
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
                    <FieldLabel htmlFor="edit-project-role-slug">Slug</FieldLabel>
                    <Input
                      {...field}
                      id="edit-project-role-slug"
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
                    <FieldLabel htmlFor="edit-project-role-description">Description</FieldLabel>
                    <Input
                      {...field}
                      id="edit-project-role-description"
                      placeholder="Manage billing settings"
                      isError={Boolean(error)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            </FieldGroup>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" isDisabled={isSubmitting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="project" isPending={isSubmitting}>
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <UpgradePlanModal
        isOpen={upgradePlanPopUp.upgradePlan.isOpen}
        onOpenChange={(open) => handleUpgradePlanPopUpToggle("upgradePlan", open)}
        text="Your current plan does not include custom roles. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature
      />
    </>
  );
};
