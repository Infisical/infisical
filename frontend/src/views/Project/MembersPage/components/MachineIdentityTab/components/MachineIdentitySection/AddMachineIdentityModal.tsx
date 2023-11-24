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
    SelectItem,
} from "@app/components/v2";
import {
    useOrganization,
    useWorkspace
} from "@app/context";
import { 
    useAddMachineToWorkspace,
    useGetMachineMembershipOrgs,
    useGetRoles,
    useGetWorkspaceMachineMemberships
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = yup.object({
    machineId: yup.string().required("ST V3 id is required"),
    role: yup.string().required("ST V3 role is required")
}).required();

export type FormData = yup.InferType<typeof schema>;

type Props = {
  popUp: UsePopUpState<["machineIdentity"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["machineIdentity"]>, state?: boolean) => void;
};

export const AddMachineIdentityModal = ({
    popUp,
    handlePopUpToggle
}: Props) => {
    
    const { createNotification } = useNotificationContext();
    const { currentOrg } = useOrganization();
    const { currentWorkspace } = useWorkspace();

    const orgId = currentOrg?._id || "";
    const workspaceId = currentWorkspace?._id || "";

    const { data: machineMembershipOrgs } = useGetMachineMembershipOrgs(orgId);
    const { data: machineMemberships } = useGetWorkspaceMachineMemberships(workspaceId);

    const { data: roles } = useGetRoles({
        orgId,
        workspaceId
    });

    const { mutateAsync: addMachineToWorkspaceMutateAsync } = useAddMachineToWorkspace();
    
    const filteredMachineMembershipOrgs = useMemo(() => {
        const wsMachineIds = new Map();
        
        machineMemberships?.forEach((machineMembership) => {
            wsMachineIds.set(machineMembership.machineIdentity._id, true);
        });
        
        return (machineMembershipOrgs || []).filter(
          ({ machineIdentity: mi }) => !wsMachineIds.has(mi._id)
        );
    }, [machineMembershipOrgs, machineMemberships]);
    
    const {
        control,
        handleSubmit,
        reset,
        formState: { isSubmitting }
    } = useForm<FormData>({
        resolver: yupResolver(schema)
    });
    
    const onFormSubmit = async ({
        machineId,
        role
    }: FormData) => {
        try {
            await addMachineToWorkspaceMutateAsync({
                workspaceId,
                machineId,
                role
            });

            createNotification({
                text: "Successfully added machine identity to project",
                type: "success"
            });

            reset();
            handlePopUpToggle("machineIdentity", false);
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to add machine identity to project",
                type: "error"
            });
        }
    }
    
    return (
        <Modal
            isOpen={popUp?.machineIdentity?.isOpen}
                onOpenChange={(isOpen) => {
                handlePopUpToggle("machineIdentity", isOpen);
                reset();
            }}
        >
            <ModalContent title="Add Machine Identity to Project">
                {filteredMachineMembershipOrgs.length ? (
                    <form onSubmit={handleSubmit(onFormSubmit)}>
                        <Controller
                            control={control}
                            name="machineId"
                            defaultValue={filteredMachineMembershipOrgs?.[0]?._id}
                            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                                <FormControl
                                    label="Service Account"
                                    errorText={error?.message}
                                    isError={Boolean(error)}
                                >
                                    <Select
                                        defaultValue={field.value}
                                        {...field}
                                        onValueChange={(e) => onChange(e)}
                                        className="w-full"
                                    >
                                        {filteredMachineMembershipOrgs.map(({ machineIdentity }) => (
                                            <SelectItem value={machineIdentity._id} key={`org-service-${machineIdentity._id}`}>
                                                {machineIdentity.name}
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
                                {popUp?.machineIdentity?.data ? "Update" : "Create"}
                            </Button>
                            <Button colorSchema="secondary" variant="plain">
                                Cancel
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className="flex flex-col space-y-4">
                        <div>All the machine identities in your organization are already added.</div>
                        <Link href={`/org/${currentWorkspace?.organization}/members`}>
                            <Button variant="outline_bg">Create a new/another machine identities</Button>
                        </Link>
                    </div>
                )}
            </ModalContent>
        </Modal>
    );
}