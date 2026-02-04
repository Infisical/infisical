import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useGetOrgRoles } from "@app/hooks/api";
import { useLinkGroupToOrganization } from "@app/hooks/api/groups";
import { useGetOrganizationGroupsAvailable } from "@app/hooks/api/organization";

const schema = z
  .object({
    group: z.object({ name: z.string(), id: z.string() }),
    role: z.object({ name: z.string(), slug: z.string() }).optional()
  })
  .required({ group: true });

export type FormData = z.infer<typeof schema>;

type Props = {
  onClose: () => void;
};

export const OrgGroupLinkForm = ({ onClose }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { data: roles } = useGetOrgRoles(orgId);
  const { data: availableGroups = [], isPending: isGroupsLoading } =
    useGetOrganizationGroupsAvailable(orgId);
  const { mutateAsync: linkGroup, isPending: isLinking } = useLinkGroupToOrganization();

  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: undefined }
  });

  const onFormSubmit = async ({ group, role }: FormData) => {
    await linkGroup({
      organizationId: orgId,
      groupId: group.id,
      role: role?.slug
    });
    createNotification({
      text: "Successfully linked group to sub-organization",
      type: "success"
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
              options={availableGroups}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
              isLoading={isGroupsLoading}
            />
          </FormControl>
        )}
      />
      {roles && roles.length > 0 && (
        <Controller
          control={control}
          name="role"
          render={({ field: { onChange, value }, fieldState: { error } }) => (
            <FormControl
              label="Role (optional)"
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
      )}
      <div className="mt-4 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting || isLinking}
          isDisabled={isSubmitting || isLinking}
        >
          Link
        </Button>
        <Button colorSchema="secondary" variant="plain" onClick={onClose} type="button">
          Cancel
        </Button>
      </div>
    </form>
  );
};
