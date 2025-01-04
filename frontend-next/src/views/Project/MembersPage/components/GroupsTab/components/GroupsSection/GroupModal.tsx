import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl, Modal, ModalContent } from "@app/components/v2";
import { useOrganization, useWorkspace } from "@app/context";
import {
  useAddGroupToWorkspace,
  useGetOrganizationGroups,
  useGetProjectRoles,
  useListWorkspaceGroups
} from "@app/hooks/api";
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

const Content = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();

  const orgId = currentOrg?.id || "";

  const { data: groups } = useGetOrganizationGroups(orgId);
  const { data: groupMemberships } = useListWorkspaceGroups(currentWorkspace?.id || "");

  const { data: roles } = useGetProjectRoles(currentWorkspace?.id || "");

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
    try {
      await addGroupToWorkspaceMutateAsync({
        projectId: currentWorkspace?.id || "",
        groupId: group.id,
        role: role.slug || undefined
      });

      reset();
      handlePopUpToggle("group", false);

      createNotification({
        text: "Successfully added group to project",
        type: "success"
      });
    } catch (err) {
      createNotification({
        text: "Failed to add group to project",
        type: "error"
      });
    }
  };

  return filteredGroupMembershipOrgs.length ? (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="group"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl label="Group" errorText={error?.message} isError={Boolean(error)}>
            <FilterableSelect
              value={value}
              onChange={onChange}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
              options={filteredGroupMembershipOrgs}
              placeholder="Select group..."
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
              getOptionValue={(option) => option.slug}
              getOptionLabel={(option) => option.name}
              options={roles}
              placeholder="Select role..."
            />
          </FormControl>
        )}
      />
      <div className="mt-6 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {popUp?.group?.data ? "Update" : "Add"}
        </Button>
        <Button
          colorSchema="secondary"
          variant="plain"
          onClick={() => handlePopUpToggle("group", false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  ) : (
    <div className="flex flex-col space-y-4">
      <div className="text-sm">
        All groups in your organization have already been added to this project.
      </div>
      <Link href={`/org/${currentWorkspace?.orgId}/members`}>
        <Button variant="outline_bg">Create a new group</Button>
      </Link>
    </div>
  );
};

export const GroupModal = ({ popUp, handlePopUpToggle }: Props) => {
  return (
    <Modal
      isOpen={popUp?.group?.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("group", isOpen)}
    >
      <ModalContent bodyClassName="overflow-visible" title="Add Group to Project">
        <Content popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      </ModalContent>
    </Modal>
  );
};
