import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Modal, ModalContent, Select, SelectItem } from "@app/components/v2";
import { useOrganization, useWorkspace } from "@app/context";
import {
  useAddGroupToWorkspace,
  useGetOrganizationGroups,
  useGetProjectRoles,
  useListWorkspaceGroups
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  slug: z.string(),
  role: z.string()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["group"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["group"]>, state?: boolean) => void;
};

export const GroupModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();

  const orgId = currentOrg?.id || "";
  const projectSlug = currentWorkspace?.slug || "";

  const { data: groups } = useGetOrganizationGroups(orgId);
  const { data: groupMemberships } = useListWorkspaceGroups(currentWorkspace?.slug || "");

  const { data: roles } = useGetProjectRoles(projectSlug);

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

  const onFormSubmit = async ({ slug, role }: FormData) => {
    try {
      await addGroupToWorkspaceMutateAsync({
        projectSlug: currentWorkspace?.slug || "",
        groupSlug: slug,
        role: role || undefined
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

  return (
    <Modal
      isOpen={popUp?.group?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("group", isOpen);
        reset();
      }}
    >
      <ModalContent title="Add Group to Project">
        {filteredGroupMembershipOrgs.length ? (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              name="slug"
              defaultValue={filteredGroupMembershipOrgs?.[0]?.id}
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl label="Group" errorText={error?.message} isError={Boolean(error)}>
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full border border-mineshaft-600"
                    placeholder="Select group..."
                  >
                    {filteredGroupMembershipOrgs.map(({ name, slug, id }) => (
                      <SelectItem value={slug} key={`org-group-${id}`} >
                        {name}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="role"
              defaultValue=""
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Role"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  className="mt-4"
                >
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                    placeholder="Select role..."
                  >
                    {(roles || []).map(({ name, slug }) => (
                      <SelectItem value={slug} key={`st-role-${slug}`}>
                        {name}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <div className="flex items-center mt-6">
              <Button
                className="mr-4"
                size="sm"
                type="submit"
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
              >
                {popUp?.group?.data ? "Update" : "Create"}
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
        )}
      </ModalContent>
    </Modal>
  );
};
