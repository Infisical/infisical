import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  IconButton,
  Input,
  Label,
  Switch
} from "@app/components/v3";
import { useOrganization, useSubscription } from "@app/context";
import { findOrgMembershipRole, isCustomOrgRole } from "@app/helpers/roles";
import { useGetOrgRoles, useUpdateOrgIdentity } from "@app/hooks/api";
import { usePopUp, UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    name: z.string().min(1, "Required"),
    role: z.object({ slug: z.string(), name: z.string() }),
    hasDeleteProtection: z.boolean(),
    metadata: z
      .object({
        key: z.string().trim().min(1),
        value: z.string().trim().min(1)
      })
      .array()
      .default([])
      .optional()
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["identity"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["identity"]>, state?: boolean) => void;
};

export const OrgIdentityModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentOrg, isSubOrganization } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { subscription } = useSubscription();
  const {
    popUp: upgradePlanPopUp,
    handlePopUpOpen: handleUpgradePlanPopUpOpen,
    handlePopUpToggle: handleUpgradePlanPopUpToggle
  } = usePopUp(["upgradePlan"] as const);

  const { data: roles } = useGetOrgRoles(orgId);
  const isOrgIdentity = popUp?.identity?.data ? orgId === popUp?.identity?.data?.orgId : true;

  const { mutateAsync: updateMutateAsync } = useUpdateOrgIdentity();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      hasDeleteProtection: true
    }
  });

  const metadataFormFields = useFieldArray({
    control,
    name: "metadata"
  });
  useEffect(() => {
    const identity = popUp?.identity?.data as {
      identityId: string;
      name: string;
      role: string;
      hasDeleteProtection: boolean;
      metadata?: { key: string; value: string }[];
      customRole: {
        name: string;
        slug: string;
      };
    };

    if (!roles?.length) return;

    if (identity) {
      reset({
        name: identity.name,
        role: identity.customRole ?? findOrgMembershipRole(roles, identity.role),
        hasDeleteProtection: identity.hasDeleteProtection,
        metadata: identity.metadata
      });
    } else {
      reset({
        name: "",
        role: findOrgMembershipRole(roles, currentOrg!.defaultMembershipRole),
        hasDeleteProtection: true
      });
    }
  }, [popUp?.identity?.data, roles]);

  const onFormSubmit = async ({ name, role, metadata, hasDeleteProtection }: FormData) => {
    if (role?.slug && isCustomOrgRole(role.slug) && subscription && !subscription?.rbac) {
      handleUpgradePlanPopUpOpen("upgradePlan");
      return;
    }

    const identity = popUp?.identity?.data as {
      identityId: string;
      name: string;
      role: string;
      hasDeleteProtection: boolean;
      orgId: string;
    };

    await updateMutateAsync({
      identityId: identity.identityId,
      name,
      role: role.slug || undefined,
      hasDeleteProtection,
      organizationId: orgId,
      metadata
    });

    handlePopUpToggle("identity", false);

    createNotification({
      text: "Successfully updated machine identity",
      type: "success"
    });

    reset();
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
      {isOrgIdentity && (
        <Controller
          control={control}
          defaultValue=""
          name="name"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldContent>
                <Input {...field} autoFocus placeholder="Machine 1" isError={Boolean(error)} />
              </FieldContent>
              {error && <FieldError>{error.message}</FieldError>}
            </Field>
          )}
        />
      )}
      <Controller
        control={control}
        name="role"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>{`${popUp?.identity?.data ? "Update " : ""}Role`}</FieldLabel>
            <FieldContent>
              <FilterableSelect
                placeholder="Select role..."
                options={roles}
                onChange={onChange}
                value={value}
                getOptionValue={(option) => option.slug}
                getOptionLabel={(option) => option.name}
                components={{ Option: RoleOption }}
                isError={Boolean(error)}
              />
            </FieldContent>
            {error && <FieldError>{error.message}</FieldError>}
          </Field>
        )}
      />
      {isOrgIdentity && (
        <Controller
          control={control}
          name="hasDeleteProtection"
          render={({ field: { onChange, value } }) => (
            <Field orientation="horizontal">
              <Switch
                id="delete-protection-enabled"
                variant={isSubOrganization ? "sub-org" : "org"}
                checked={value}
                onCheckedChange={onChange}
              />
              <FieldContent>
                <Label htmlFor="delete-protection-enabled">Delete Protection</Label>
                <FieldDescription>
                  Prevents this identity from being deleted while enabled.
                </FieldDescription>
              </FieldContent>
            </Field>
          )}
        />
      )}
      {isOrgIdentity && (
        <div className="flex flex-col gap-2">
          <Label>Metadata</Label>
          <div
            className={`flex max-h-[30vh] thin-scrollbar flex-col gap-3 overflow-y-auto rounded-md border border-border bg-container/50 p-4 ${
              metadataFormFields.fields.length === 0 ? "border-dashed" : ""
            }`}
          >
            {metadataFormFields.fields.length === 0 ? (
              <p className="text-center text-sm text-muted">
                No metadata entries. Click below to add.
              </p>
            ) : (
              metadataFormFields.fields.map(({ id: metadataFieldId }, i) => (
                <div key={metadataFieldId} className="flex items-start gap-2">
                  <Field className="flex-1">
                    {i === 0 && <FieldLabel className="text-xs">Key</FieldLabel>}
                    <FieldContent>
                      <Controller
                        control={control}
                        name={`metadata.${i}.key`}
                        render={({ field, fieldState: { error } }) => (
                          <>
                            <Input {...field} isError={Boolean(error)} />
                            {error && <FieldError>{error.message}</FieldError>}
                          </>
                        )}
                      />
                    </FieldContent>
                  </Field>
                  <Field className="flex-1">
                    {i === 0 && <FieldLabel className="text-xs">Value</FieldLabel>}
                    <FieldContent>
                      <Controller
                        control={control}
                        name={`metadata.${i}.value`}
                        render={({ field, fieldState: { error } }) => (
                          <>
                            <Input {...field} isError={Boolean(error)} />
                            {error && <FieldError>{error.message}</FieldError>}
                          </>
                        )}
                      />
                    </FieldContent>
                  </Field>
                  <IconButton
                    aria-label="Remove metadata entry"
                    variant="ghost"
                    size="sm"
                    type="button"
                    className={twMerge(i === 0 ? "mt-[27px]" : "mt-[3px]", "hover:text-danger")}
                    onClick={() => metadataFormFields.remove(i)}
                  >
                    <TrashIcon />
                  </IconButton>
                </div>
              ))
            )}
          </div>
          <div>
            <Button
              variant="ghost"
              size="xs"
              type="button"
              onClick={() => metadataFormFields.append({ key: "", value: "" })}
            >
              <PlusIcon className="mr-1 size-4" />
              Add Entry
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => handlePopUpToggle("identity", false)}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant={isSubOrganization ? "sub-org" : "org"}
          isPending={isSubmitting}
          isDisabled={isSubmitting}
        >
          Update
        </Button>
      </div>
      <UpgradePlanModal
        isOpen={upgradePlanPopUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handleUpgradePlanPopUpToggle("upgradePlan", isOpen)}
        text="Assigning custom roles to machine identities can be unlocked if you upgrade to Infisical Enterprise plan."
        isEnterpriseFeature
      />
    </form>
  );
};
