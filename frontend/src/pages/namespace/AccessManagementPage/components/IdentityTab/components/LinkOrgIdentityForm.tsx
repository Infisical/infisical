import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl, ModalClose, Spinner } from "@app/components/v2";
import { useNamespace, useOrganization } from "@app/context";
import { useGetIdentityMembershipOrgs } from "@app/hooks/api";
import {
  namespaceIdentityMembershipQueryKeys,
  useCreateNamespaceIdentityMembership
} from "@app/hooks/api/namespaceIdentityMembership";
import { namespaceRolesQueryKeys } from "@app/hooks/api/namespaceRoles";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  identity: z.object({ name: z.string(), id: z.string() }),
  role: z.object({ name: z.string(), slug: z.string() })
});

export type FormData = z.infer<typeof schema>;

type Props = {
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["linkOrgIdentity"]>, state?: boolean) => void;
};

export const LinkOrgIdentityForm = ({ handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const { namespaceId } = useNamespace();

  const organizationId = currentOrg?.id || "";

  const { data: identityMembershipOrgsData, isPending: isMembershipsLoading } =
    useGetIdentityMembershipOrgs({
      organizationId,
      limit: 1000 // TODO: this is temp to preserve functionality for larger namespace, will replace with combobox in separate PR
    });

  const identityMembershipOrgs = identityMembershipOrgsData?.identityMemberships;
  const { data: identityMembershipsData } = useQuery(
    namespaceIdentityMembershipQueryKeys.list({
      limit: 1000,
      namespaceId
    })
  );
  const identityMemberships = identityMembershipsData?.identityMemberships;

  const { data: { roles = [] } = {}, isPending: isRolesLoading } = useQuery(
    namespaceRolesQueryKeys.list({
      namespaceId,
      limit: 10000
    })
  );

  const { mutateAsync: addIdentityToNamespaceMutateAsync } = useCreateNamespaceIdentityMembership();

  const filteredIdentityMembershipOrgs = useMemo(() => {
    const namespaceIdentityIds = new Map();

    identityMemberships?.forEach((identityMembership) => {
      namespaceIdentityIds.set(identityMembership.identity.id, true);
    });

    return (identityMembershipOrgs || []).filter(
      ({ identity: i }) => !namespaceIdentityIds.has(i.id)
    );
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
    try {
      await addIdentityToNamespaceMutateAsync({
        namespaceId,
        identityId: identity.id,
        roles: [{ role: role.slug, isTemporary: false }]
      });

      createNotification({
        text: "Successfully added identity to namespace",
        type: "success"
      });

      const nextAvailableMembership = filteredIdentityMembershipOrgs.filter(
        (membership) => membership.identity.id !== identity.id
      )[0];

      // prevents combobox from displaying previously added identity
      reset({
        identity: {
          name: nextAvailableMembership?.identity.name,
          id: nextAvailableMembership?.identity.id
        }
      });
      handlePopUpToggle("linkOrgIdentity", false);
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text =
        typeof error?.response?.data?.message === "string"
          ? error?.response?.data?.message
          : "Failed to add identity to namespace";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  if (isMembershipsLoading || isRolesLoading)
    return (
      <div className="flex w-full items-center justify-center py-10">
        <Spinner className="text-mineshaft-400" />
      </div>
    );

  return filteredIdentityMembershipOrgs.length ? (
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
              options={filteredIdentityMembershipOrgs.map((membership) => membership.identity)}
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
          Assign Identity
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  ) : (
    <div className="flex flex-col space-y-4">
      <div className="text-sm">
        All identities in your organization have already been added to this namespace.
      </div>
      <Link to={"/organization/access-management" as const}>
        <Button isDisabled={isRolesLoading} isLoading={isRolesLoading} variant="outline_bg">
          Create a new identity
        </Button>
      </Link>
    </div>
  );
};
