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
    ModalContent,
    Select,
    SelectItem,
    TextArea} from "@app/components/v2";
import { useOrganization } from "@app/context";
import {
    useCreateSSOConfig,
    useGetSSOConfig,
    useUpdateSSOConfig
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const ssoAuthProviders = [
    { label: "Okta SAML 2.0", value: "okta-saml" }
];

const schema = yup.object({
    authProvider: yup.string().required("SSO Type is required"),
    entryPoint: yup.string().required("IDP entrypoint is required"),
    issuer: yup.string().required("Issuer string is required"),
    cert: yup.string().required("IDP's public signing certificate is required"),
    audience: yup.string().required("Expected SAML response audience is required"),
}).required();

export type AddSSOFormData = yup.InferType<typeof schema>;

type Props = {
  popUp: UsePopUpState<["addSSO"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addSSO"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addSSO"]>, state?: boolean) => void;
};

export const SSOModal = ({
    popUp,
    handlePopUpClose,
    handlePopUpToggle
}: Props) => {
    const { currentOrg } = useOrganization();
    const { createNotification } = useNotificationContext();
    const { mutateAsync: createMutateAsync, isLoading: createIsLoading } = useCreateSSOConfig();
    const { mutateAsync: updateMutateAsync, isLoading: updateIsLoading } = useUpdateSSOConfig();
    const { data } = useGetSSOConfig(currentOrg?._id ?? "");
    
    const {
        control,
        handleSubmit,
        reset,
        watch,
    } = useForm<AddSSOFormData>({
        defaultValues: {
            authProvider: "okta-saml"
        },
        resolver: yupResolver(schema)
    });
    
    useEffect(() => {
        if (data) {
            reset({
                authProvider: data?.authProvider ?? "",
                entryPoint: data?.entryPoint ?? "",
                issuer: data?.issuer ?? "",
                cert: data?.cert ?? "",
                audience: data?.audience ?? ""
            });
        }
    }, [data]);
    
    const onSSOModalSubmit = async ({
        authProvider,
        entryPoint,
        issuer,
        cert,
        audience
    }: AddSSOFormData) => {
        try {
            if (!currentOrg) return;
            
            if (!data) {
                await createMutateAsync({
                    organizationId: currentOrg._id,
                    authProvider,
                    isActive: false,
                    entryPoint,
                    issuer,
                    cert,
                    audience
                });
            } else {
                await updateMutateAsync({
                    organizationId: currentOrg._id,
                    authProvider,
                    isActive: false,
                    entryPoint,
                    issuer,
                    cert,
                    audience 
                });
            }

            handlePopUpClose("addSSO");

            createNotification({
                text: `Successfully ${!data ? "added" : "updated"} SAML SSO configuration`,
                type: "success"
            });
        } catch (err) {
            console.error(err);
            createNotification({
                text: `Failed to ${!data ? "add" : "update"} SAML SSO configuration`,
                type: "error"
            });
        }
    }

    const authProvider = watch("authProvider");

    return (
        <Modal
            isOpen={popUp?.addSSO?.isOpen}
                onOpenChange={(isOpen) => {
                handlePopUpToggle("addSSO", isOpen);
                reset();
            }}
        >
            <ModalContent title="Add SSO">
                <form onSubmit={handleSubmit(onSSOModalSubmit)}>
                    <Controller
                        control={control}
                        name="authProvider"
                        defaultValue="okta-saml"
                        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                            <FormControl
                                label="Type"
                                errorText={error?.message}
                                isError={Boolean(error)}
                            >
                                <Select
                                    defaultValue={field.value}
                                    {...field}
                                    onValueChange={(e) => onChange(e)}
                                    className="w-full"
                                >
                                    {ssoAuthProviders.map(({ label, value }) => (
                                        <SelectItem value={String(value || "")} key={label}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                    />
                    {authProvider && authProvider === "okta-saml" && (
                        <>
                            <Controller
                                control={control}
                                name="audience"
                                render={({ field, fieldState: { error } }) => (
                                    <FormControl
                                        label="Audience"
                                        errorText={error?.message}
                                        isError={Boolean(error)}
                                    >
                                        <Input 
                                            {...field} 
                                            placeholder="https://your-domain.com"
                                        />
                                    </FormControl>
                                )}
                            />
                            <Controller
                                control={control}
                                name="entryPoint"
                                render={({ field, fieldState: { error } }) => (
                                    <FormControl
                                        label="Entrypoint"
                                        errorText={error?.message}
                                        isError={Boolean(error)}
                                    >
                                        <Input 
                                            {...field} 
                                            placeholder="https://your-domain.okta.com/app/app-name/xxx/sso/saml"
                                        />
                                    </FormControl>
                                )}
                            />
                            <Controller
                                control={control}
                                name="issuer"
                                render={({ field, fieldState: { error } }) => (
                                    <FormControl
                                        label="Issuer"
                                        errorText={error?.message}
                                        isError={Boolean(error)}
                                    >
                                        <Input 
                                            {...field} 
                                            placeholder="http://www.okta.com/xxx"
                                        />
                                    </FormControl>
                                )}
                            />
                            <Controller
                                control={control}
                                name="cert"
                                render={({ field, fieldState: { error } }) => (
                                    <FormControl
                                        label="Certificate"
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
                        </>
                    )}
                    
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
                            onClick={() => handlePopUpClose("addSSO")}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            </ModalContent>
        </Modal>
    );
}