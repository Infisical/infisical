import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useGetOrgRoles } from "@app/hooks/api";
import { useCreateOrgIdentityMembership } from "@app/hooks/api/orgIdentityMembership";
import { orgIdentityMembershipQuery } from "@app/hooks/api/orgIdentityMembership/queries";

const schema = z
  .object({
    identity: z.object({ name: z.string(), id: z.string() }),
    role: z.object({ name: z.string(), slug: z.string() })
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  onClose: () => void;
};

export const OrgIdentityLinkForm = ({ onClose }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { data: roles } = useGetOrgRoles(orgId);

  // const [searchValue, setSearchValue] = useState("");
  //
  // const [debouncedSearchValue] = useDebounce(searchValue);

  const { mutateAsync: createMutateAsync } = useCreateOrgIdentityMembership();

  // TODO: name filter needs to be implemented on backend
  const { data: rootOrgIdentities, isPending: isRootOrgLoading } = useQuery({
    ...orgIdentityMembershipQuery.listAvailable({
      // identityName: debouncedSearchValue
    }),
    placeholderData: (prev) => prev
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {}
  });

  const onFormSubmit = async ({ identity, role }: FormData) => {
    await createMutateAsync({
      identityId: identity.id,
      roles: [{ role: role.slug, isTemporary: false }]
    });
    createNotification({
      text: "Successfully linked identity",
      type: "success"
    });
    navigate({
      to: "/organizations/$orgId/identities/$identityId",
      params: {
        identityId: identity.id,
        orgId: currentOrg.id
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
      <Controller
        control={control}
        name="identity"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Machine Identity</FieldLabel>
            <FieldContent>
              <FilterableSelect
                value={value}
                onChange={onChange}
                placeholder="Select machine identity..."
                // onInputChange={setSearchValue}
                autoFocus
                options={rootOrgIdentities}
                getOptionValue={(option) => option.id}
                getOptionLabel={(option) => option.name}
                isLoading={isRootOrgLoading}
                isError={Boolean(error)}
              />
            </FieldContent>
            {error && <FieldError>{error.message}</FieldError>}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="role"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Role</FieldLabel>
            <FieldContent>
              <FilterableSelect
                value={value}
                onChange={onChange}
                options={roles}
                placeholder="Select role..."
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
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onClose()}>
          Cancel
        </Button>
        <Button type="submit" variant="sub-org" isPending={isSubmitting} isDisabled={isSubmitting}>
          Assign to Sub-Organization
        </Button>
      </div>
    </form>
  );
};
