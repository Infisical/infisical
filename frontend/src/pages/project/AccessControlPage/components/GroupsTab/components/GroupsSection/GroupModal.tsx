import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import {
  useAddGroupToWorkspace,
  useGetOrganizationGroups,
  useGetProjectRoles,
  useListWorkspaceGroups
} from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  group: z.object({ id: z.string(), name: z.string() }),
  role: z.object({ slug: z.string(), name: z.string() })
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["group"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["group"]>, state?: boolean) => void;
};

// TODO: update backend to support adding multiple roles at once

const Content = ({ onClose }: { onClose: () => void }) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const orgId = currentOrg?.id || "";

  const { data: groups } = useGetOrganizationGroups(orgId);
  const { data: groupMemberships } = useListWorkspaceGroups(
    currentProject?.id || "",
    currentProject?.type
  );

  const { data: roles } = useGetProjectRoles(currentProject?.id || "", currentProject?.type);

  const { mutateAsync: addGroupToWorkspaceMutateAsync } = useAddGroupToWorkspace();

  const filteredGroupMembershipOrgs = useMemo(() => {
    const wsGroupIds = new Map();

    groupMemberships?.forEach((groupMembership) => {
      wsGroupIds.set(groupMembership.group.id, true);
    });

    return (groups || []).filter(({ id }) => !wsGroupIds.has(id));
  }, [groups, groupMemberships]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const onFormSubmit = async ({ group, role }: FormData) => {
    await addGroupToWorkspaceMutateAsync({
      projectId: currentProject?.id || "",
      projectType: currentProject?.type,
      groupId: group.id,
      role: role.slug || undefined
    });

    reset();
    onClose();

    createNotification({
      text: "Successfully added group to project",
      type: "success"
    });
  };

  return filteredGroupMembershipOrgs.length ? (
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
              options={filteredGroupMembershipOrgs}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
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
        <Button variant="ghost" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="project" type="submit" isPending={isSubmitting} isDisabled={isSubmitting}>
          Add
        </Button>
      </DialogFooter>
    </form>
  ) : (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        Every group in your organization is already added. To add another group, create one at the
        organization level first.
      </p>
      <Button asChild variant="outline" className="self-end">
        <Link
          to={"/organizations/$orgId/access-management" as const}
          params={{ orgId }}
          search={{ selectedTab: "groups" }}
        >
          Go to organization groups <ArrowRightIcon />
        </Link>
      </Button>
    </div>
  );
};

export const GroupModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;
  const productLabel = isCertManager ? "Certificate Manager" : "Project";

  return (
    <Dialog
      open={popUp?.group?.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("group", isOpen)}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{`Add Group to ${productLabel}`}</DialogTitle>
        </DialogHeader>
        <Content onClose={() => handlePopUpToggle("group", false)} />
      </DialogContent>
    </Dialog>
  );
};
