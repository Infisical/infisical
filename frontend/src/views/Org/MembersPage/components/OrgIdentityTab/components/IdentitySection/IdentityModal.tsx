import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useRouter } from "next/router";
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
import { useOrganization } from "@app/context";
import { findOrgMembershipRole } from "@app/helpers/roles";
import { useCreateIdentity, useGetOrgRoles, useUpdateIdentity } from "@app/hooks/api";
import { useAddIdentityUniversalAuth } from "@app/hooks/api/identities";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    name: z.string().min(1, "Required"),
    role: z.object({ slug: z.string(), name: z.string() }),
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
  // handlePopUpOpen: (
  //   popUpName: keyof UsePopUpState<["identityAuthMethod"]>,
  //   data: {
  //     identityId: string;
  //     name: string;
  //     authMethod?: IdentityAuthMethod;
  //   }
  // ) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["identity"]>, state?: boolean) => void;
};

export const IdentityModal = ({ popUp, handlePopUpToggle }: Props) => {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { data: roles } = useGetOrgRoles(orgId);

  const { mutateAsync: createMutateAsync } = useCreateIdentity();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentity();
  const { mutateAsync: addMutateAsync } = useAddIdentityUniversalAuth();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: ""
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
        metadata: identity.metadata
      });
    } else {
      reset({
        name: "",
        role: findOrgMembershipRole(roles, currentOrg!.defaultMembershipRole)
      });
    }
  }, [popUp?.identity?.data, roles]);

  const onFormSubmit = async ({ name, role, metadata }: FormData) => {
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
          role: role.slug || undefined,
          organizationId: orgId,
          metadata
        });

        handlePopUpToggle("identity", false);
      } else {
        // create

        const { id: createdId } = await createMutateAsync({
          name,
          role: role.slug || undefined,
          organizationId: orgId,
          metadata
        });

        await addMutateAsync({
          organizationId: orgId,
          identityId: createdId,
          clientSecretTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
          accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
          accessTokenTTL: 2592000,
          accessTokenMaxTTL: 2592000,
          accessTokenNumUsesLimit: 0
        });

        handlePopUpToggle("identity", false);
        router.push(`/org/${orgId}/identities/${createdId}`);
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
        `Failed to ${popUp?.identity?.data ? "update" : "create"} identity`;

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
      <ModalContent
        bodyClassName="overflow-visible"
        title={`${popUp?.identity?.data ? "Update" : "Create"} Identity`}
      >
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
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <FormControl
                label={`${popUp?.identity?.data ? "Update" : ""} Role`}
                errorText={error?.message}
                isError={Boolean(error)}
                className="mt-4"
              >
                <FilterableSelect
                  placeholder="Select role..."
                  options={roles}
                  onChange={onChange}
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
                <div className="flex-grow">
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
                <div className="flex-grow">
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
