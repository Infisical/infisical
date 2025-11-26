import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl, ModalClose, Spinner } from "@app/components/v2";
import { useProject } from "@app/context";
import {
  projectIdentityMembershipQuery,
  useCreateProjectIdentityMembership,
  useGetProjectRoles,
  useListProjectIdentityMemberships
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  identity: z.object({
    name: z.string(),
    id: z.string()
  }),
  role: z.object({ name: z.string(), slug: z.string() })
});

export type FormData = z.infer<typeof schema>;

type Props = {
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["createIdentity"]>, state?: boolean) => void;
};

export const ProjectLinkIdentityModal = ({ handlePopUpToggle }: Props) => {
  const { projectId } = useProject();

  // const [searchValue, setSearchValue] = useState("");

  // const [debouncedSearchValue] = useDebounce(searchValue);

  // TODO: name search needs to be implemented on the backend
  const { data: identityMembershipOrgs, isPending: isMembershipsLoading } = useQuery({
    ...projectIdentityMembershipQuery.listAvailable({
      projectId
      // identityName: debouncedSearchValue
    }),
    placeholderData: (prev) => prev
  });

  const { data: identityMembershipsData } = useListProjectIdentityMemberships({
    projectId,
    limit: 1000 // TODO: this is temp to preserve functionality for larger projects, will optimize in PR referenced above
  });
  const identityMemberships = identityMembershipsData?.identityMemberships;

  const { data: roles, isPending: isRolesLoading } = useGetProjectRoles(projectId);

  const { mutateAsync: createProjectIdentityMembershipMutateAsync } =
    useCreateProjectIdentityMembership();

  const filteredIdentityMembershipOrgs = useMemo(() => {
    const wsIdentityIds = new Map();

    identityMemberships?.forEach((identityMembership) => {
      wsIdentityIds.set(identityMembership.identity.id, true);
    });

    return (identityMembershipOrgs || []).filter((i) => !wsIdentityIds.has(i.id));
  }, [identityMembershipOrgs, identityMemberships]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const onFormSubmit = async ({ identity, role }: FormData) => {
    await createProjectIdentityMembershipMutateAsync({
      projectId,
      identityId: identity.id,
      role: role.slug || undefined
    });

    createNotification({
      text: "Successfully added machine identity to project",
      type: "success"
    });

    const nextAvailableMembership = filteredIdentityMembershipOrgs.filter(
      (membership) => membership.id !== identity.id
    )[0];

    // prevents combobox from displaying previously added identity
    reset({
      identity: {
        name: nextAvailableMembership?.name,
        id: nextAvailableMembership?.id
      }
    });
    handlePopUpToggle("createIdentity", false);
  };

  if (isMembershipsLoading || isRolesLoading)
    return (
      <div className="flex w-full items-center justify-center py-10">
        <Spinner className="text-mineshaft-400" />
      </div>
    );

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="identity"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl label="Machine Identity" errorText={error?.message} isError={Boolean(error)}>
            <FilterableSelect
              value={value}
              onChange={onChange}
              placeholder="Select machine identity..."
              // onInputChange={setSearchValue}
              options={filteredIdentityMembershipOrgs.map((membership) => ({
                name: membership.name,
                id: membership.id
              }))}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
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
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};
