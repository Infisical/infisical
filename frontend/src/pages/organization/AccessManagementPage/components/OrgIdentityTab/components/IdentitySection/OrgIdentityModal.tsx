import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Switch
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { findOrgMembershipRole } from "@app/helpers/roles";
import { useCreateOrgIdentity, useGetOrgRoles, useUpdateOrgIdentity } from "@app/hooks/api";
import { useAddIdentityUniversalAuth } from "@app/hooks/api/identities";
import { UsePopUpState } from "@app/hooks/usePopUp";

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
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { data: roles } = useGetOrgRoles(orgId);
  const isOrgIdentity = popUp?.identity?.data ? orgId === popUp?.identity?.data?.orgId : true;

  const { mutateAsync: createMutateAsync } = useCreateOrgIdentity();
  const { mutateAsync: updateMutateAsync } = useUpdateOrgIdentity();
  const { mutateAsync: addMutateAsync } = useAddIdentityUniversalAuth();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      hasDeleteProtection: false
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
        hasDeleteProtection: false
      });
    }
  }, [popUp?.identity?.data, roles]);

  const onFormSubmit = async ({ name, role, metadata, hasDeleteProtection }: FormData) => {
    const identity = popUp?.identity?.data as {
      identityId: string;
      name: string;
      role: string;
      hasDeleteProtection: boolean;
      orgId: string;
    };

    if (identity) {
      // update

      await updateMutateAsync({
        identityId: identity.identityId,
        name,
        role: role.slug || undefined,
        hasDeleteProtection,
        organizationId: orgId,
        metadata
      });

      handlePopUpToggle("identity", false);
    } else {
      // create

      const { id: createdId } = await createMutateAsync({
        name,
        role: role.slug || undefined,
        hasDeleteProtection,
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
        accessTokenNumUsesLimit: 0,
        accessTokenPeriod: 0,
        lockoutEnabled: true,
        lockoutThreshold: 3,
        lockoutDurationSeconds: 300,
        lockoutCounterResetSeconds: 30
      });

      handlePopUpToggle("identity", false);
      navigate({
        to: "/organizations/$orgId/identities/$identityId",
        params: {
          identityId: createdId,
          orgId
        }
      });
    }

    createNotification({
      text: `Successfully ${popUp?.identity?.data ? "updated" : "created"} machine identity`,
      type: "success"
    });

    reset();
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      {isOrgIdentity && (
        <Controller
          control={control}
          defaultValue=""
          name="name"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              className="mb-4"
              label="Name"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input {...field} placeholder="Machine 1" />
            </FormControl>
          )}
        />
      )}
      <Controller
        control={control}
        name="role"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl
            label={`${popUp?.identity?.data ? "Update" : ""} Role`}
            errorText={error?.message}
            isError={Boolean(error)}
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
      {isOrgIdentity && (
        <Controller
          control={control}
          name="hasDeleteProtection"
          render={({ field: { onChange, value }, fieldState: { error } }) => (
            <FormControl errorText={error?.message} isError={Boolean(error)}>
              <Switch
                className="mr-2 ml-0 bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                containerClassName="flex-row-reverse w-fit"
                id="delete-protection-enabled"
                thumbClassName="bg-mineshaft-800"
                onCheckedChange={onChange}
                isChecked={value}
              >
                <p>Delete Protection {value ? "Enabled" : "Disabled"}</p>
              </Switch>
            </FormControl>
          )}
        />
      )}
      {isOrgIdentity && (
        <>
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
        </>
      )}
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
  );
};
