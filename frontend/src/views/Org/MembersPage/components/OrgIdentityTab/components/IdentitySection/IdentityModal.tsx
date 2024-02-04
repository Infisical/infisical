import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useCreateIdentity, useGetOrgRoles, useUpdateIdentity } from "@app/hooks/api";
import { IdentityAuthMethod } from "@app/hooks/api/identities";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = yup
  .object({
    name: yup.string().required("MI name is required"),
    role: yup.string()
  })
  .required();

export type FormData = yup.InferType<typeof schema>;

type Props = {
  popUp: UsePopUpState<["identity"]>;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["identityAuthMethod"]>,
    data: {
      identityId: string;
      name: string;
      authMethod?: IdentityAuthMethod;
    }
  ) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["identity"]>, state?: boolean) => void;
};

export const IdentityModal = ({ popUp, handlePopUpOpen, handlePopUpToggle }: Props) => {
  const { createNotification } = useNotificationContext();

  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { data: roles } = useGetOrgRoles(orgId);

  const { mutateAsync: createMutateAsync } = useCreateIdentity();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentity();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      name: ""
    }
  });

  useEffect(() => {
    const identity = popUp?.identity?.data as {
      identityId: string;
      name: string;
      role: string;
      customRole: {
        name: string;
        slug: string;
      };
    };

    if (!roles?.length) return;

    if (identity) {
      reset({
        name: identity.name,
        role: identity?.customRole?.slug ?? identity.role
      });
    } else {
      reset({
        name: "",
        role: roles[0].slug
      });
    }
  }, [popUp?.identity?.data, roles]);

  const onFormSubmit = async ({ name, role }: FormData) => {
    try {
      const identity = popUp?.identity?.data as {
        identityId: string;
        name: string;
        role: string;
      };

      if (identity) {
        // update

        await updateMutateAsync({
          identityId: identity.identityId,
          name,
          role: role || undefined,
          organizationId: orgId
        });

        handlePopUpToggle("identity", false);
      } else {
        // create

        const {
          id: createdId,
          name: createdName,
          authMethod
        } = await createMutateAsync({
          name,
          role: role || undefined,
          organizationId: orgId
        });

        handlePopUpToggle("identity", false);
        handlePopUpOpen("identityAuthMethod", {
          identityId: createdId,
          name: createdName,
          authMethod
        });
      }

      createNotification({
        text: `Successfully ${popUp?.identity?.data ? "updated" : "created"} identity`,
        type: "success"
      });

      reset();
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text =
        error?.response?.data?.message ??
        `Failed to ${popUp?.identity?.data ? "updated" : "created"} identity`;

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.identity?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("identity", isOpen);
        reset();
      }}
    >
      <ModalContent title={`${popUp?.identity?.data ? "Update" : "Create"} Identity`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Name" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="Machine 1" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="role"
            defaultValue=""
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label={`${popUp?.identity?.data ? "Update" : ""} Role`}
                errorText={error?.message}
                isError={Boolean(error)}
                className="mt-4"
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
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
              {popUp?.identity?.data ? "Update" : "Create"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("identity", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
