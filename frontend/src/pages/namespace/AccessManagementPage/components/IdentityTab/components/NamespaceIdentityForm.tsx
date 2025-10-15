import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
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
import { useNamespace, useOrganization } from "@app/context";
import { NamespaceMembershipRole } from "@app/helpers/roles";
import { useAddIdentityUniversalAuth } from "@app/hooks/api/identities";
import {
  namespaceIdentityQueryKeys,
  useCreateNamespaceIdentity,
  useUpdateNamespaceIdentity
} from "@app/hooks/api/namespaceIdentity";
import { useUpdateNamespaceIdentityMembership } from "@app/hooks/api/namespaceIdentityMembership";
import { namespaceRolesQueryKeys } from "@app/hooks/api/namespaceRoles";

const schema = z
  .object({
    name: z.string().min(1, "Required"),
    role: z.object({ slug: z.string(), name: z.string() }).optional(),
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
  handlePopUpToggle: () => void;
  identityId?: string;
};

export const NamespaceIdentityForm = ({ handlePopUpToggle, identityId }: Props) => {
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const { namespaceId } = useNamespace();
  const isUpdate = Boolean(identityId);

  const { data: identityDetails } = useQuery({
    ...namespaceIdentityQueryKeys.detail({
      identityId: identityId as string,
      namespaceId
    }),
    enabled: Boolean(identityId)
  });

  const { data: { roles = [] } = {} } = useQuery(
    namespaceRolesQueryKeys.list({
      limit: 1000,
      namespaceId
    })
  );

  const { mutateAsync: createNamespaceIdentity } = useCreateNamespaceIdentity();
  const { mutateAsync: updateNamespaceIdentityMembership } = useUpdateNamespaceIdentityMembership();
  const { mutateAsync: updateNamespaceIdentity } = useUpdateNamespaceIdentity();
  const { mutateAsync: addIdentityUniversalAuth } = useAddIdentityUniversalAuth();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: {
      hasDeleteProtection: Boolean(identityDetails?.hasDeleteProtection),
      role: { name: "No Access", slug: NamespaceMembershipRole.NoAccess },
      name: identityDetails?.name || "",
      metadata: identityDetails?.metadata || []
    }
  });

  const metadataFormFields = useFieldArray({
    control,
    name: "metadata"
  });

  const onFormSubmit = async ({ name, role, metadata, hasDeleteProtection }: FormData) => {
    try {
      if (identityId) {
        // update
        await updateNamespaceIdentity({
          identityId,
          name,
          hasDeleteProtection,
          metadata,
          namespaceId
        });

        handlePopUpToggle();
      } else {
        // create
        const {
          data: { identity }
        } = await createNamespaceIdentity({
          name,
          hasDeleteProtection,
          metadata,
          namespaceId
        });
        await updateNamespaceIdentityMembership({
          identityId: identity.id,
          namespaceId,
          roles: [{ role: role.slug, isTemporary: false }]
        });

        await addIdentityUniversalAuth({
          organizationId: currentOrg.id,
          identityId: identity.id,
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

        handlePopUpToggle();
        navigate({
          to: "/organization/namespaces/$namespaceId/identities/$identityId",
          params: {
            namespaceId,
            identityId: identity.id
          }
        });
      }

      createNotification({
        text: `Successfully ${isUpdate ? "updated" : "created"} identity`,
        type: "success"
      });

      reset();
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text =
        error?.response?.data?.message ?? `Failed to ${isUpdate ? "update" : "create"} identity`;

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
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
      {!isUpdate && (
        <Controller
          control={control}
          name="role"
          render={({ field: { onChange, value }, fieldState: { error } }) => (
            <FormControl
              label={`${isUpdate ? "Update" : ""} Role`}
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
      )}
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
          {isUpdate ? "Update" : "Create"}
        </Button>
        <Button colorSchema="secondary" variant="plain" onClick={handlePopUpToggle}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
