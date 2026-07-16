import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Button,
  DialogFooter,
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
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
    <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
      <Controller
        control={control}
        name="group"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="group">Group</FieldLabel>
            <FilterableSelect
              inputId="group"
              value={value}
              onChange={onChange}
              placeholder="Select group..."
              autoFocus
              isError={Boolean(error)}
              options={rootOrgGroups ?? []}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
              isLoading={isRootOrgLoading}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        control={control}
        name="role"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="role">Role</FieldLabel>
            <FilterableSelect
              inputId="role"
              value={value}
              onChange={onChange}
              options={roles ?? []}
              placeholder="Select role..."
              isError={Boolean(error)}
              getOptionValue={(option) => option.slug}
              getOptionLabel={(option) => option.name}
              components={{ Option: RoleOption }}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <DialogFooter>
        <Button variant="ghost" type="button" onClick={() => onClose()}>
          Cancel
        </Button>
        <Button variant="org" type="submit" isPending={isSubmitting} isDisabled={isSubmitting}>
          Link
        </Button>
      </DialogFooter>
    </form>
  );
};
