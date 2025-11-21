import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl } from "@app/components/v2";
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
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="identity"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl label="Identity" errorText={error?.message} isError={Boolean(error)}>
            <FilterableSelect
              value={value}
              onChange={onChange}
              placeholder="Select identity..."
              // onInputChange={setSearchValue}
              options={rootOrgIdentities}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
              isLoading={isRootOrgLoading}
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="role"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl
            label="Role"
            errorText={error?.message}
            isError={Boolean(error)}
            className="mt-4"
          >
            <FilterableSelect
              value={value}
              onChange={onChange}
              options={roles}
              placeholder="Select role..."
              getOptionValue={(option) => option.slug}
              getOptionLabel={(option) => option.name}
            />
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
          Link
        </Button>
        <Button colorSchema="secondary" variant="plain" onClick={() => onClose()}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
