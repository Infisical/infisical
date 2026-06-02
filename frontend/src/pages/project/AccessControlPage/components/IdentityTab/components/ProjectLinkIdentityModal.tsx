import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
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
  const { projectId, currentProject } = useProject();

  // const [searchValue, setSearchValue] = useState("");

  // const [debouncedSearchValue] = useDebounce(searchValue);

  // TODO: name search needs to be implemented on the backend
  const { data: identityMembershipOrgs, isPending: isMembershipsLoading } = useQuery({
    ...projectIdentityMembershipQuery.listAvailable({
      projectId,
      projectType: currentProject?.type
      // identityName: debouncedSearchValue
    }),
    placeholderData: (prev) => prev
  });

  const { data: identityMembershipsData } = useListProjectIdentityMemberships({
    projectId,
    projectType: currentProject?.type,
    limit: 1000 // TODO: this is temp to preserve functionality for larger projects, will optimize in PR referenced above
  });
  const identityMemberships = identityMembershipsData?.identityMemberships;

  const { data: roles, isPending: isRolesLoading } = useGetProjectRoles(
    projectId,
    currentProject?.type
  );

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
      projectType: currentProject?.type,
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
                isLoading={isMembershipsLoading}
                placeholder="Select machine identity..."
                autoFocus
                // onInputChange={setSearchValue}
                options={filteredIdentityMembershipOrgs.map((membership) => ({
                  name: membership.name,
                  id: membership.id
                }))}
                getOptionValue={(option) => option.id}
                getOptionLabel={(option) => option.name}
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
                isLoading={isRolesLoading}
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
        <Button
          type="button"
          variant="outline"
          onClick={() => handlePopUpToggle("createIdentity", false)}
        >
          Cancel
        </Button>
        <Button type="submit" variant="project" isPending={isSubmitting} isDisabled={isSubmitting}>
          Assign to Project
        </Button>
      </div>
    </form>
  );
};
