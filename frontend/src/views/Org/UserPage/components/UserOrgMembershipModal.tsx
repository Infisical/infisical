import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Modal, ModalContent, Select, SelectItem } from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import { useGetOrgRoles, useUpdateOrgMembership } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  role: z.string()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["orgMembership"]>;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["upgradePlan"]>, data?: {}) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["orgMembership"]>, state?: boolean) => void;
};

export const UserOrgMembershipModal = ({ popUp, handlePopUpOpen, handlePopUpToggle }: Props) => {
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { data: roles } = useGetOrgRoles(orgId);

  const { mutateAsync: updateOrgMembership } = useUpdateOrgMembership();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const popUpData = popUp?.orgMembership?.data as {
    membershipId: string;
    role: string;
  };

  useEffect(() => {
    if (!roles?.length) return;

    if (popUpData) {
      reset({
        role: popUpData.role
      });
    } else {
      reset({
        role: roles[0].slug
      });
    }
  }, [popUp?.orgMembership?.data, roles]);

  const onFormSubmit = async ({ role }: FormData) => {
    try {
      if (!orgId) return;

      await updateOrgMembership({
        organizationId: orgId,
        membershipId: popUpData.membershipId,
        role
      });

      handlePopUpToggle("orgMembership", false);

      createNotification({
        text: "Successfully updated user organization role",
        type: "success"
      });

      reset();
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to update user organization role";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.orgMembership?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("orgMembership", isOpen);
        reset();
      }}
    >
      <ModalContent title="Update Membership">
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="role"
            defaultValue=""
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Update Organization Role"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => {
                    const isCustomRole = !["admin", "member", "no-access"].includes(e);

                    if (isCustomRole && subscription && !subscription?.rbac) {
                      handlePopUpOpen("upgradePlan", {
                        description:
                          "You can assign custom roles to members if you upgrade your Infisical plan."
                      });
                      return;
                    }

                    onChange(e);
                  }}
                  className="w-full"
                >
                  {(roles || []).map(({ name, slug }) => (
                    <SelectItem value={slug} key={`st-role-${slug}`}>
                      {name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
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
