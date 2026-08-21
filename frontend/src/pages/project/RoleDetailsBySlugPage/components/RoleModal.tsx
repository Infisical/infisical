import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import slugify from "@sindresorhus/slugify";
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
  SheetTitle
} from "@app/components/v3";
import { useOrganization, useProject, useSubscription } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { useCreateProjectRole } from "@app/hooks/api";
import { usePopUp, UsePopUpState } from "@app/hooks/usePopUp";
import { slugSchema } from "@app/lib/schemas";

const schema = z
  .object({
    name: z.string().min(1, "Name required"),
    description: z.string(),
    slug: slugSchema({ min: 1 })
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["role"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["role"]>, state?: boolean) => void;
};

export const RoleModal = ({ popUp, handlePopUpToggle }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const { mutateAsync: createProjectRole } = useCreateProjectRole();
  const {
    popUp: upgradePlanPopUp,
    handlePopUpOpen: handleUpgradePlanPopUpOpen,
    handlePopUpToggle: handleUpgradePlanPopUpToggle
  } = usePopUp(["upgradePlan"] as const);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      slug: ""
    }
  });

  const onFormSubmit = async ({ name, description, slug }: FormData) => {
    if (!currentProject?.id) return;

    if (subscription && !subscription.rbac) {
      handleUpgradePlanPopUpOpen("upgradePlan");
      return;
    }

    const newRole = await createProjectRole({
      projectId: currentProject.id,
      name,
      description,
      slug,
      permissions: []
    });

    navigate({
      to: `${getProjectBaseURL(currentProject.type)}/roles/$roleSlug` as const,
      params: {
        orgId: currentOrg?.id || "",
        roleSlug: newRole.slug,
        projectId: currentProject.id
      }
    });
    handlePopUpToggle("role", false);
    createNotification({
      text: `Project role "${name}" created`,
      type: "success"
    });
    reset();
  };

  return (
    <>
      <Sheet
        open={popUp.role.isOpen}
        onOpenChange={(open) => {
          handlePopUpToggle("role", open);
          if (!open) reset();
        }}
      >
        <SheetContent>
          <form
            onSubmit={handleSubmit(onFormSubmit)}
            autoComplete="off"
            className="flex min-h-0 flex-1 flex-col"
          >
            <SheetHeader>
              <SheetTitle>Create Role</SheetTitle>
              <SheetDescription>
                Create a custom project role. You can configure its permissions after creation.
              </SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 thin-scrollbar flex-1 flex-col overflow-y-auto p-4">
              <FieldGroup>
                <Controller
                  control={control}
                  name="name"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="create-project-role-name">Name</FieldLabel>
                      <Input
                        {...field}
                        id="create-project-role-name"
                        placeholder="Billing Team"
                        autoComplete="off"
                        data-1p-ignore
                        isError={Boolean(error)}
                        onChange={(e) => {
                          onChange(e);
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
                      <FieldLabel htmlFor="create-project-role-slug">Slug</FieldLabel>
                      <Input
                        {...field}
                        id="create-project-role-slug"
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
                      <FieldLabel htmlFor="create-project-role-description">Description</FieldLabel>
                      <Input
                        {...field}
                        id="create-project-role-description"
                        placeholder="Manage billing settings"
                        autoComplete="off"
                        data-1p-ignore
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
                Create Role
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      <UpgradePlanModal
        isOpen={upgradePlanPopUp.upgradePlan.isOpen}
        onOpenChange={(open) => handleUpgradePlanPopUpToggle("upgradePlan", open)}
        text="Your current plan does not include custom roles. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature
      />
    </>
  );
};
