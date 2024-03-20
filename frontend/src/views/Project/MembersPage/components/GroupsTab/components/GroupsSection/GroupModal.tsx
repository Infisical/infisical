import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import Link from "next/link";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
    Button,
    FormControl,
    Modal,
    ModalContent,
    Select,
    SelectItem} from "@app/components/v2";
import { useOrganization, useWorkspace } from "@app/context";
import { 
    useAddGroupToWorkspace,
    useGetOrganizationGroups,
    useGetProjectRoles,
    useGetWorkspaceGroupMemberships,
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

// TODO: change this to zod

const schema = yup
  .object({
    slug: yup.string().required("Group slug is required"),
    role: yup.string()
  })
  .required();

export type FormData = yup.InferType<typeof schema>;

type Props = {
  popUp: UsePopUpState<["group"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["group"]>, state?: boolean) => void;
};

export const GroupModal = ({
    popUp,
    handlePopUpToggle
}: Props) => {
    const { createNotification } = useNotificationContext();
    const { currentOrg } = useOrganization();
    const { currentWorkspace } = useWorkspace();

    const orgId = currentOrg?.id || "";
    const workspaceId = currentWorkspace?.id || "";
    
    const { data: groups } = useGetOrganizationGroups(orgId);
    const { data: groupMemberships } = useGetWorkspaceGroupMemberships(workspaceId);
    
    const { data: roles } = useGetProjectRoles(workspaceId);
    
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
        resolver: yupResolver(schema)
      });

    const onFormSubmit = async ({ slug, role }: FormData) => {
        try {
            await addGroupToWorkspaceMutateAsync({
                workspaceId,
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
    }
    
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
                                className="w-full"
                            >
                                {filteredGroupMembershipOrgs.map(({ name, slug, id }) => (
                                    <SelectItem value={slug} key={`org-group-${id}`}>
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
                    <div className="flex items-center">
                        <Button
                            className="mr-4"
                            size="sm"
                            type="submit"
                            isLoading={isSubmitting}
                            isDisabled={isSubmitting}
                        >
                            {popUp?.group?.data ? "Update" : "Create"}
                        </Button>
                        <Button colorSchema="secondary" variant="plain">
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
}