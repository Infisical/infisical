import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useGetOrgRoles } from "@app/hooks/api";
import { useCreateOrgGroupMembership } from "@app/hooks/api/orgGroupMembership";
import { orgGroupMembershipQuery } from "@app/hooks/api/orgGroupMembership/queries";

const schema = z
  .object({
    group: z.object({ name: z.string(), id: z.string(), slug: z.string() }),
    role: z.object({ name: z.string(), slug: z.string() })
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  onClose: () => void;
};

export const OrgGroupLinkForm = ({ onClose }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { data: roles } = useGetOrgRoles(orgId);
  const { mutateAsync: createMutateAsync } = useCreateOrgGroupMembership();

  const { data: rootOrgGroups, isPending: isRootOrgLoading } = useQuery({
    ...orgGroupMembershipQuery.listAvailable({}),
    placeholderData: (prev) => prev,
    enabled: Boolean(orgId)
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {}
  });

  const onFormSubmit = async ({ group, role }: FormData) => {
    await createMutateAsync({
      groupId: group.id,
      roles: [{ role: role.slug, isTemporary: false }],
      organizationId: orgId
    });
    createNotification({
      text: "Successfully linked group",
      type: "success"
    });
    navigate({
      to: "/organizations/$orgId/groups/$groupId",
      params: {
        groupId: group.id,
        orgId: currentOrg!.id
      }
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="group"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl label="Group" errorText={error?.message} isError={Boolean(error)}>
            <FilterableSelect
              value={value}
              onChange={onChange}
              placeholder="Select group..."
              autoFocus
              options={rootOrgGroups ?? []}
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
              options={roles ?? []}
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
