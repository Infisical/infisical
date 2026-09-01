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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useOrganization, useSubscription } from "@app/context";
import { useCreateOrgRole, useGetOrgRole, useUpdateOrgRole } from "@app/hooks/api";
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
  const orgId = currentOrg?.id || "";
  const { subscription } = useSubscription();
  const {
    popUp: upgradePlanPopUp,
    handlePopUpOpen: handleUpgradePlanPopUpOpen,
    handlePopUpToggle: handleUpgradePlanPopUpToggle
  } = usePopUp(["upgradePlan"] as const);

  const popupData = popUp?.role?.data as {
    roleId: string;
  };

  const { data: role } = useGetOrgRole(orgId, popupData?.roleId ?? "");

  const { mutateAsync: createOrgRole } = useCreateOrgRole();
  const { mutateAsync: updateOrgRole } = useUpdateOrgRole();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: ""
    }
  });

  useEffect(() => {
    if (role) {
      reset({
        name: role.name,
        description: role.description,
        slug: role.slug
      });
    } else {
      reset({
        name: "",
        description: "",
        slug: ""
      });
    }
  }, [role]);

  const onFormSubmit = async ({ name, description, slug }: FormData) => {
    if (!orgId) return;

    if (subscription && !subscription?.rbac) {
      handleUpgradePlanPopUpOpen("upgradePlan");
      return;
    }

    if (role) {
      // update

      await updateOrgRole({
        orgId,
        id: role.id,
        name,
        description,
        slug
      });

      handlePopUpToggle("role", false);
    } else {
      // create

      const newRole = await createOrgRole({
        orgId,
        name,
        description,
        slug,
        permissions: []
      });

      handlePopUpToggle("role", false);
      navigate({
        to: "/organizations/$orgId/roles/$roleId" as const,
        params: {
          orgId,
          roleId: newRole.id
        }
      });
    }

    createNotification({
      text: `Successfully ${popUp?.role?.data ? "updated" : "created"} role`,
      type: "success"
    });

    reset();
  };

  return (
    <>
      <Dialog
        open={popUp?.role?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("role", isOpen);
          reset();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{popUp?.role?.data ? "Update" : "Create"} Role</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <FieldGroup>
              <Controller
                control={control}
                defaultValue=""
                name="name"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="name">Name</FieldLabel>
                    <Input
                      id="name"
                      placeholder="Billing Team"
                      isError={Boolean(error)}
                      {...field}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                defaultValue=""
                name="slug"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="slug">Slug</FieldLabel>
                    <Input id="slug" placeholder="billing" isError={Boolean(error)} {...field} />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                defaultValue=""
                name="description"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="description">Description (optional)</FieldLabel>
                    <Input
                      id="description"
                      placeholder="To manage billing"
                      isError={Boolean(error)}
                      {...field}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            </FieldGroup>
            <DialogFooter className="mt-6">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="org"
                isPending={isSubmitting}
                isDisabled={isSubmitting}
              >
                {popUp?.role?.data ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <UpgradePlanModal
        isOpen={upgradePlanPopUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handleUpgradePlanPopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include custom roles. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature
      />
    </>
  );
};
