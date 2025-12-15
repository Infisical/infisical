import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { SingleValue } from "react-select";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalContent
} from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import { findOrgMembershipRole, isCustomOrgRole } from "@app/helpers/roles";
import { useGetOrgRoles, useUpdateOrgMembership } from "@app/hooks/api";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
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
  const { currentOrg } = useOrganization();
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
    <Modal
      isOpen={popUp?.orgMembership?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("orgMembership", isOpen);
        reset();
      }}
    >
      <ModalContent bodyClassName="overflow-visible" title="Update Membership">
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="role"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <FormControl
                label="Update Organization Role"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <FilterableSelect
                  placeholder="Select role..."
                  options={roles}
                  onChange={(newValue) => {
                    const role = newValue as SingleValue<(typeof roles)[number]>;

                    if (!role) return;

                    const isCustomRole = isCustomOrgRole(role.slug);

                    if (
                      isCustomRole &&
                      subscription &&
                      !subscription?.get(SubscriptionProductCategory.Platform, "rbac")
                    ) {
                      handlePopUpOpen("upgradePlan", {
                        text: "Your current plan does not include access to assig custom roles to members. To unlock this feature, please upgrade to Infisical Pro plan."
                      });
                      return;
                    }

                    onChange(role);
                  }}
                  value={value}
                  getOptionValue={(option) => option.slug}
                  getOptionLabel={(option) => option.name}
                />
              </FormControl>
            )}
          />
          <div>
            <FormLabel label="Metadata" />
          </div>
          <div className="mb-3 flex flex-col space-y-2">
            {metadataFormFields.fields.map(({ id: metadataFieldId }, i) => (
              <div key={metadataFieldId} className="flex items-end space-x-2">
                <div className="grow">
                  {i === 0 && <span className="text-xs text-mineshaft-400">Key</span>}
                  <Controller
                    control={control}
                    name={`metadata.${i}.key`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        className="mb-0"
                      >
                        <Input {...field} />
                      </FormControl>
                    )}
                  />
                </div>
                <div className="grow">
                  {i === 0 && (
                    <FormLabel label="Value" className="text-xs text-mineshaft-400" isOptional />
                  )}
                  <Controller
                    control={control}
                    name={`metadata.${i}.value`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        className="mb-0"
                      >
                        <Input {...field} />
                      </FormControl>
                    )}
                  />
                </div>
                <IconButton
                  ariaLabel="delete key"
                  className="bottom-0.5 h-9"
                  variant="outline_bg"
                  onClick={() => metadataFormFields.remove(i)}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              </div>
            ))}
            <div className="mt-2 flex justify-end">
              <Button
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                size="xs"
                variant="outline_bg"
                onClick={() => metadataFormFields.append({ key: "", value: "" })}
              >
                Add Key
              </Button>
            </div>
          </div>
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Update
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("orgMembership", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
