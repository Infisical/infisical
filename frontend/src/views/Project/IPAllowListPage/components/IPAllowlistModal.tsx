import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form"; 
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
    useAddTrustedIp,
    useGetMyIp,
    useUpdateTrustedIp
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = yup.object({
    ipAddress: yup.string().required("IP address is required"),
    comment: yup.string()
}).required();

export type FormData = yup.InferType<typeof schema>;

type Props = {
  popUp: UsePopUpState<["trustedIp"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["trustedIp"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["trustedIp"]>, state?: boolean) => void;
};

export const IPAllowlistModal = ({
    popUp,
    handlePopUpClose,
    handlePopUpToggle
}: Props) => {
    const { createNotification } = useNotificationContext();
    const { data, isLoading } = useGetMyIp();
    
    const { currentWorkspace } = useWorkspace();
    const addTrustedIp = useAddTrustedIp();
    const updateTrustedIp = useUpdateTrustedIp();

    const {
        control,
        setValue,
        handleSubmit,
        reset,
        formState: { isSubmitting }
    } = useForm<FormData>({
        resolver: yupResolver(schema)
    });
    
    useEffect(() => {
        const trustedIpData = popUp?.trustedIp?.data as { 
            ipAddress: string;
            comment: string;
            prefix: number;
        };

        if (popUp?.trustedIp?.data) {
            reset({
                ipAddress: `${trustedIpData.ipAddress}${trustedIpData.prefix !== undefined ? `/${trustedIpData.prefix}` : ""}`,
                comment: trustedIpData.comment
            });
        } else {
           reset({
                ipAddress: "",
                comment: ""
            }); 
        }
    
    }, [popUp?.trustedIp?.data]);
    
    const onIPAllowlistModalSubmit = async ({
        ipAddress,
        comment
    }: FormData) => {
        try {
            if (!currentWorkspace?._id) return;
            
            if (popUp?.trustedIp?.data) {
                await updateTrustedIp.mutateAsync({
                    workspaceId: currentWorkspace._id,
                    trustedIpId: (popUp?.trustedIp?.data as { trustedIpId: string })?.trustedIpId,
                    ipAddress,
                    comment,
                    isActive: true
                });
            } else {
                await addTrustedIp.mutateAsync({
                    workspaceId: currentWorkspace._id,
                    ipAddress,
                    comment,
                    isActive: true
                });
            }
            
            createNotification({
                text: `Successfully ${popUp?.trustedIp?.data ? "updated" : "added"} trusted IP`,
                type: "success"
            });
            
            reset();
            handlePopUpClose("trustedIp");
        } catch (err) {
            createNotification({
                text: `Failed to ${popUp?.trustedIp?.data ? "update" : "add"} trusted IP`,
                type: "error"
            });
        }
    }

    return (
        <Modal
            isOpen={popUp?.trustedIp?.isOpen}
            onOpenChange={(isOpen) => {
                handlePopUpToggle("trustedIp", isOpen);
                reset();
            }}
        >
            <ModalContent title={popUp?.trustedIp?.data ? "Update IP" : "Add IP"}>
            <form onSubmit={handleSubmit(onIPAllowlistModalSubmit)}>
                <Controller
                    control={control}
                    defaultValue=""
                    name="ipAddress"
                    render={({ field, fieldState: { error } }) => (
                        <FormControl
                            label="IPv4/IPv6 Address / CIDR Notation"
                            isError={Boolean(error)}
                            errorText={error?.message}
                        >
                        <Input 
                            {...field} 
                            placeholder="123.456.789.0"
                        />
                        </FormControl>
                    )}
                />
                {!isLoading && data && (
                    <Button
                        colorSchema="secondary"
                        type="button"
                        onClick={() => setValue("ipAddress", data)}
                        className="mb-8"
                    >
                        Add current IP address
                    </Button>
                )}
                <Controller
                    control={control}
                    defaultValue=""
                    name="comment"
                    render={({ field, fieldState: { error } }) => (
                        <FormControl
                            label="Comment"
                            isError={Boolean(error)}
                            errorText={error?.message}
                        >
                        <Input 
                            {...field} 
                            placeholder="My IP address"
                        />
                        </FormControl>
                    )}
                />
                <div className="mt-8 flex items-center">
                <Button
                    className="mr-4"
                    size="sm"
                    type="submit"
                    isLoading={isSubmitting}
                    isDisabled={isSubmitting}
                >
                    {popUp?.trustedIp?.data ? "Update" : "Add"}
                </Button>
                <Button 
                    colorSchema="secondary" 
                    variant="plain"
                    onClick={() => handlePopUpClose("trustedIp")}
                >
                    Cancel
                </Button>
                </div>
            </form>
            </ModalContent>
        </Modal> 
    );
}