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
import { useAddServiceToWorkspace ,
    useGetOrgServiceMemberships,
    useGetRoles,
    useGetWorkspaceServiceMemberships} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = yup.object({
    serviceTokenDataId: yup.string().required("ST V3 id is required"),
    role: yup.string().required("ST V3 role is required")
}).required();

export type FormData = yup.InferType<typeof schema>;

type Props = {
  popUp: UsePopUpState<["serviceTokenV3"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["serviceTokenV3"]>, state?: boolean) => void;
};

export const AddServiceTokenV3Modal = ({
    popUp,
    handlePopUpToggle
}: Props) => {
    
    const { createNotification } = useNotificationContext();
    const { currentOrg } = useOrganization();
    const { currentWorkspace } = useWorkspace();

    const orgId = currentOrg?._id || "";
    const workspaceId = currentWorkspace?._id || "";

    const { data: orgServices } = useGetOrgServiceMemberships(orgId);
    const { data: services } = useGetWorkspaceServiceMemberships(workspaceId);
    const { data: roles } = useGetRoles({
        orgId,
        workspaceId
    });

    const addServiceToWorkspace = useAddServiceToWorkspace();
    
    const filteredOrgServices = useMemo(() => {
        const wsServiceIds = new Map();
        
        services?.forEach((service) => {
            wsServiceIds.set(service.service._id, true);
        });
        
        return (orgServices || []).filter(
          ({ service: s }) => !wsServiceIds.has(s._id)
        );
    }, [orgServices, services]);
    
    const {
        control,
        handleSubmit,
        reset,
        formState: { isSubmitting }
    } = useForm<FormData>({
        resolver: yupResolver(schema)
    });
    
    const onFormSubmit = async ({
        serviceTokenDataId,
        role
    }: FormData) => {
        try {
            
            await addServiceToWorkspace.mutateAsync({
                workspaceId,
                serviceId: serviceTokenDataId as string,
                role
            });

            createNotification({
                text: "Successfully added service account to project",
                type: "success"
            });

            reset();
            handlePopUpToggle("serviceTokenV3", false);
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to add service account to project",
                type: "error"
            });
        }
    }
    
    return (
        <Modal
            isOpen={popUp?.serviceTokenV3?.isOpen}
                onOpenChange={(isOpen) => {
                handlePopUpToggle("serviceTokenV3", isOpen);
                reset();
            }}
        >
            <ModalContent title="Add a service account to the project">
                {filteredOrgServices.length ? (
                    <form onSubmit={handleSubmit(onFormSubmit)}>
                        <Controller
                            control={control}
                            name="serviceTokenDataId"
                            defaultValue={filteredOrgServices?.[0]?._id}
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
                                        {filteredOrgServices.map(({ service }) => (
                                            <SelectItem value={service._id} key={`org-service-${service._id}`}>
                                                {service.name}
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
                                {popUp?.serviceTokenV3?.data ? "Update" : "Create"}
                            </Button>
                            <Button colorSchema="secondary" variant="plain">
                                Cancel
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className="flex flex-col space-y-4">
                        <div>All the service accounts in your organization are already added.</div>
                        <Link href={`/org/${currentWorkspace?.organization}/members`}>
                            <Button variant="outline_bg">Add service accounts to organization</Button>
                        </Link>
                    </div>
                )}
            </ModalContent>
        </Modal>
    );
}