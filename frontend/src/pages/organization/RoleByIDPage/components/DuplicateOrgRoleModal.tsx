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
import { useSubscription } from "@app/context";
import { useCreateOrgRole, useGetOrgRole } from "@app/hooks/api";
import { TOrgRole, TOrgRoleSummary, TPermission } from "@app/hooks/api/roles/types";
import { usePopUp } from "@app/hooks/usePopUp";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  role?: TOrgRoleSummary;
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
  role: TOrgRoleSummary;
  permissions?: TPermission[];
  isRolePending: boolean;
  isRoleError: boolean;
  onClose: () => void;
};

const Content = ({ role, permissions, isRolePending, isRoleError, onClose }: ContentProps) => {
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    defaultValues: {
      name: `${role.name} Duplicate`
    },
    resolver: zodResolver(schema)
  });

  const { subscription } = useSubscription();
  const {
    popUp: upgradePlanPopUp,
    handlePopUpOpen: handleUpgradePlanPopUpOpen,
    handlePopUpToggle: handleUpgradePlanPopUpToggle
  } = usePopUp(["upgradePlan"] as const);

  const createRole = useCreateOrgRole();
  const navigate = useNavigate();

  const handleDuplicateRole = async (form: FormData) => {
    if (!permissions) return;

    if (subscription && !subscription?.rbac) {
      handleUpgradePlanPopUpOpen("upgradePlan");
      return;
    }

    const newRole = await createRole.mutateAsync({
      orgId: role.orgId,
      permissions,
      ...form
    });

    createNotification({
      type: "success",
      text: "Role duplicated successfully"
    });

    navigate({
      to: "/organizations/$orgId/roles/$roleId" as const,
      params: {
        orgId: role.orgId,
        roleId: newRole.id
      }
    });

    onClose();
  };

  return (
    <>
      <form onSubmit={handleSubmit(handleDuplicateRole)}>
        <FieldGroup>
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input id="name" placeholder="Billing Team" isError={Boolean(error)} {...field} />
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
        {isRoleError && (
          <p className="mt-4 text-sm text-danger">
            Could not load the role permissions. Close the dialog and try again.
          </p>
        )}
        <DialogFooter className="mt-6">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="submit"
            variant="org"
            isPending={isSubmitting || isRolePending}
            isDisabled={isSubmitting || isRolePending || !permissions}
          >
            Duplicate Role
          </Button>
        </DialogFooter>
      </form>
      <UpgradePlanModal
        isOpen={upgradePlanPopUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handleUpgradePlanPopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include custom roles. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature
      />
    </>
  );
};

const hasPermissions = (role: TOrgRoleSummary): role is TOrgRole =>
  "permissions" in role && Array.isArray(role.permissions);

export const DuplicateOrgRoleModal = ({ isOpen, onOpenChange, role }: Props) => {
  const needsRoleFetch = Boolean(role && !hasPermissions(role));
  const roleQuery = useGetOrgRole(role?.orgId ?? "", needsRoleFetch && role ? role.id : "");

  if (!role) return null;

  const permissions = hasPermissions(role) ? role.permissions : roleQuery.data?.permissions;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate Role</DialogTitle>
          <DialogDescription>
            Duplicate this role to create a new role with the same permissions.
          </DialogDescription>
        </DialogHeader>
        <Content
          role={role}
          permissions={permissions}
          isRolePending={needsRoleFetch && roleQuery.isPending}
          isRoleError={needsRoleFetch && roleQuery.isError}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
