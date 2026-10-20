import { useEffect, useId } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, TrashIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Input
} from "@app/components/v3";
import { useOrganization, useSubscription } from "@app/context";
import { findOrgMembershipRole, isCustomOrgRole } from "@app/helpers/roles";
import { useGetOrgRoles, useUpdateOrgMembership } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  role: z.object({ name: z.string(), slug: z.string() }),
  metadata: z
    .object({
      key: z.string().trim().min(1),
      value: z.string().trim().min(1)
    })
    .array()
    .optional()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["orgMembership"]>;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["upgradePlan"]>, data?: object) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["orgMembership"]>, state?: boolean) => void;
};

export const UserOrgMembershipModal = ({ popUp, handlePopUpOpen, handlePopUpToggle }: Props) => {
  const { subscription } = useSubscription();
  const { currentOrg, isSubOrganization } = useOrganization();
  const roleInputId = useId();
  const orgId = currentOrg?.id || "";

  const { data: roles = [] } = useGetOrgRoles(orgId);

  const { mutateAsync: updateOrgMembership } = useUpdateOrgMembership();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const metadataFormFields = useFieldArray({
    control,
    name: "metadata"
  });

  const popUpData = popUp?.orgMembership?.data as {
    membershipId: string;
    role: string;
    roleId?: string;
    metadata: { key: string; value: string }[];
  };

  useEffect(() => {
    if (!roles?.length) return;

    if (popUpData) {
      reset({
        role: findOrgMembershipRole(roles, popUpData.roleId ?? popUpData.role),
        metadata: popUpData.metadata
      });
    } else {
      reset({
        role: findOrgMembershipRole(roles, currentOrg!.defaultMembershipRole!)
      });
    }
  }, [popUp?.orgMembership?.data, roles]);

  const onFormSubmit = async ({ role, metadata }: FormData) => {
    if (!orgId) return;

    if (isCustomOrgRole(role.slug) && subscription && !subscription?.rbac) {
      handlePopUpOpen("upgradePlan", {
        text: "Your current plan does not include access to assigning custom roles to members. To unlock this feature, please upgrade to Infisical Enterprise plan.",
        isEnterpriseFeature: true
      });
      return;
    }

    await updateOrgMembership({
      organizationId: orgId,
      membershipId: popUpData.membershipId,
      role: role.slug,
      metadata
    });

    handlePopUpToggle("orgMembership", false);

    createNotification({
      text: "Successfully updated user organization role",
      type: "success"
    });

    reset();
  };

  return (
    <Dialog
      open={popUp?.orgMembership?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("orgMembership", isOpen);
        reset();
      }}
    >
      <DialogContent isPending={isSubmitting}>
        <DialogHeader>
          <DialogTitle>Update Membership</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-6" onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="role"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor={roleInputId}>Update Organization Role</FieldLabel>
                <Combobox
                  id={roleInputId}
                  placeholder="Select role..."
                  options={roles}
                  isClearable={false}
                  isError={Boolean(error)}
                  onValueChange={(role) => {
                    const isCustomRole = isCustomOrgRole(role.slug);

                    if (isCustomRole && subscription && !subscription?.rbac) {
                      handlePopUpOpen("upgradePlan", {
                        text: "Your current plan does not include access to assigning custom roles to members. To unlock this feature, please upgrade to Infisical Enterprise plan.",
                        isEnterpriseFeature: true
                      });
                      return;
                    }

                    onChange(role);
                  }}
                  value={value ?? null}
                  getOptionValue={(option) => option.slug}
                  getOptionLabel={(option) => option.name}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <div className="flex flex-col gap-2">
            <FieldLabel>Metadata</FieldLabel>
            {metadataFormFields.fields.map(({ id: metadataFieldId }, i) => (
              <div key={metadataFieldId} className="flex items-start gap-2">
                <Field className="flex-1">
                  {i === 0 && <FieldLabel className="text-xs">Key</FieldLabel>}
                  <Controller
                    control={control}
                    name={`metadata.${i}.key`}
                    render={({ field, fieldState: { error } }) => (
                      <>
                        <Input {...field} isError={Boolean(error)} />
                        <FieldError>{error?.message}</FieldError>
                      </>
                    )}
                  />
                </Field>
                <Field className="flex-1">
                  {i === 0 && <FieldLabel className="text-xs">Value</FieldLabel>}
                  <Controller
                    control={control}
                    name={`metadata.${i}.value`}
                    render={({ field, fieldState: { error } }) => (
                      <>
                        <Input {...field} isError={Boolean(error)} />
                        <FieldError>{error?.message}</FieldError>
                      </>
                    )}
                  />
                </Field>
                <IconButton
                  aria-label="Remove metadata entry"
                  variant="ghost"
                  size="sm"
                  className={i === 0 ? "mt-[27px]" : undefined}
                  onClick={() => metadataFormFields.remove(i)}
                >
                  <TrashIcon />
                </IconButton>
              </div>
            ))}
            <Button
              variant="ghost"
              size="xs"
              className="self-end"
              onClick={() => metadataFormFields.append({ key: "", value: "" })}
            >
              <PlusIcon />
              Add Key
            </Button>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              type="submit"
              variant={isSubOrganization ? "sub-org" : "org"}
              isPending={isSubmitting}
            >
              Update
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
