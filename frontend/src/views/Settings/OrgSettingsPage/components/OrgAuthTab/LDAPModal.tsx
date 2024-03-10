import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form"; 
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
    Button,
    FormControl,
    Input,
    Modal,
    ModalContent,
    TextArea
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import {
    useCreateLDAPConfig,
    useGetLDAPConfig,
    useUpdateLDAPConfig
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const LDAPFormSchema = z.object({
    url: z.string().min(1, "URL is requiredx"),
    bindDN: z.string().min(1, "Bind DN is requiredx"),
    bindPass: z.string().min(1, "Bind Pass is required"),
    searchBase: z.string().min(1, "Search Base is required"),
    caCert: z.string().optional()
});

export type TLDAPFormData = z.infer<typeof LDAPFormSchema>;

type Props = {
  popUp: UsePopUpState<["addLDAP"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addLDAP"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addLDAP"]>, state?: boolean) => void;
};

export const LDAPModal = ({
    popUp,
    handlePopUpClose,
    handlePopUpToggle
}: Props) => {
    const { currentOrg } = useOrganization();
    const { createNotification } = useNotificationContext();
    const { mutateAsync: createMutateAsync, isLoading: createIsLoading } = useCreateLDAPConfig();
    const { mutateAsync: updateMutateAsync, isLoading: updateIsLoading } = useUpdateLDAPConfig();
    const { data } = useGetLDAPConfig(currentOrg?.id?? "");
    
    const {
        control,
        handleSubmit,
        reset,
    } = useForm<TLDAPFormData>({
        resolver: zodResolver(LDAPFormSchema)
    })
    
    useEffect(() => {
        if (data) {
            reset({
                url: data?.url ?? "",
                bindDN: data?.bindDN ?? "",
                bindPass: data?.bindPass ?? "",
                searchBase: data?.searchBase ?? "",
                caCert: data?.caCert ?? ""
            });
        }
    }, [data]);
    
    const onSSOModalSubmit = async ({
        url,
        bindDN,
        bindPass,
        searchBase,
        caCert
    }: TLDAPFormData) => {
        try {
            if (!currentOrg) return;
            
            if (!data) {
                await createMutateAsync({
                    organizationId: currentOrg.id,
                    isActive: false,
                    url,
                    bindDN,
                    bindPass,
                    searchBase,
                    caCert
                });
            } else {
                await updateMutateAsync({
                    organizationId: currentOrg.id,
                    isActive: false,
                    url,
                    bindDN,
                    bindPass,
                    searchBase,
                    caCert
                });
            }

            handlePopUpClose("addLDAP");

            createNotification({
                text: `Successfully ${!data ? "added" : "updated"} LDAP configuration`,
                type: "success"
            });
        } catch (err) {
            console.error(err);
            createNotification({
                text: `Failed to ${!data ? "add" : "update"} LDAP configuration`,
                type: "error"
            });
        }
    }

    return (
        <Modal
            isOpen={popUp?.addLDAP?.isOpen}
                onOpenChange={(isOpen) => {
                handlePopUpToggle("addLDAP", isOpen);
                reset();
            }}
        >
            <ModalContent title="Add LDAP">
                <form onSubmit={handleSubmit(onSSOModalSubmit)}>
                    <Controller
                            control={control}
                            name="url"
                            render={({ field, fieldState: { error } }) => (
                                <FormControl
                                    label="URL"
                                    errorText={error?.message}
                                    isError={Boolean(error)}
                                >
                                    <Input 
                                        {...field} 
                                        placeholder="ldaps://ldap.myorg.com:636"
                                    />
                                </FormControl>
                            )}
                        />
                        <Controller
                            control={control}
                            name="bindDN"
                            render={({ field, fieldState: { error } }) => (
                                <FormControl
                                    label="Bind DN"
                                    errorText={error?.message}
                                    isError={Boolean(error)}
                                >
                                    <Input 
                                        {...field} 
                                        placeholder="cn=infisical,ou=Users,dc=example,dc=com"
                                    />
                                </FormControl>
                            )}
                        />
                        <Controller
                            control={control}
                            name="bindPass"
                            render={({ field, fieldState: { error } }) => (
                                <FormControl
                                    label="Bind Pass"
                                    errorText={error?.message}
                                    isError={Boolean(error)}
                                >
                                    <Input 
                                        {...field} 
                                        type="password"
                                        placeholder="********"
                                    />
                                </FormControl>
                            )}
                        />
                        <Controller
                            control={control}
                            name="searchBase"
                            render={({ field, fieldState: { error } }) => (
                                <FormControl
                                    label="Search Base / User DN"
                                    errorText={error?.message}
                                    isError={Boolean(error)}
                                >
                                    <Input 
                                        {...field} 
                                        placeholder="ou=people,dc=acme,dc=com"
                                    />
                                </FormControl>
                            )}
                        />
                        <Controller
                            control={control}
                            name="caCert"
                            render={({ field, fieldState: { error } }) => (
                                <FormControl
                                    label="CA Certificate"
                                    errorText={error?.message}
                                    isError={Boolean(error)}
                                >
                                    <TextArea 
                                        {...field} 
                                        placeholder="-----BEGIN CERTIFICATE----- ..."
                                    />
                                </FormControl>
                            )}
                        />
                    <div className="mt-8 flex items-center">
                        <Button
                            className="mr-4"
                            size="sm"
                            type="submit"
                            isLoading={createIsLoading || updateIsLoading}
                        >
                            {!data ? "Add" : "Update"}
                        </Button>
                        <Button 
                            colorSchema="secondary" 
                            variant="plain"
                            onClick={() => handlePopUpClose("addLDAP")}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            </ModalContent>
        </Modal>
    );
}