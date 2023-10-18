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

enum AuthProvider {
    OKTA_SAML = "okta-saml",
    AZURE_SAML = "azure-saml",
    JUMPCLOUD_SAML = "jumpcloud-saml"
}

const ssoAuthProviders = [
    { label: "Okta SAML", value: AuthProvider.OKTA_SAML },
    { label: "Azure SAML", value: AuthProvider.AZURE_SAML },
    { label: "JumpCloud SAML", value: AuthProvider.JUMPCLOUD_SAML }
];

const schema = yup.object({
    authProvider: yup.string().required("SSO Type is required"),
    entryPoint: yup.string().required("IdP entrypoint is required"),
    issuer: yup.string().required("Issuer string is required"),
    cert: yup.string().required("IdP's public signing certificate is required")
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
            authProvider: AuthProvider.OKTA_SAML
        },
        resolver: yupResolver(schema)
    });
    
    useEffect(() => {
        if (data) {
            reset({
                authProvider: data?.authProvider ?? "",
                entryPoint: data?.entryPoint ?? "",
                issuer: data?.issuer ?? "",
                cert: data?.cert ?? ""
            });
        }
    }, [data]);
    
    const onSSOModalSubmit = async ({
        authProvider,
        entryPoint,
        issuer,
        cert
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
                    cert
                });
            } else {
                await updateMutateAsync({
                    organizationId: currentOrg._id,
                    authProvider,
                    isActive: false,
                    entryPoint,
                    issuer,
                    cert
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

    const renderLabels = (authProvider: string) => {
        switch (authProvider){
            case AuthProvider.OKTA_SAML:
                return ({
                    acsUrl: "Single sign-on URL",
                    entityId: "Audience URI (SP Entity ID)",
                    entryPoint: "Identity Provider Single Sign-On URL",
                    entryPointPlaceholder: "https://your-domain.okta.com/app/app-name/xxx/sso/saml",
                    issuer: "Identity Provider Issuer",
                    issuerPlaceholder: "http://www.okta.com/xxx"
                });
            case AuthProvider.AZURE_SAML:
                return ({
                    acsUrl: "Reply URL (Assertion Consumer Service URL)",
                    entityId: "Identifier (Entity ID)",
                    entryPoint: "Login URL",
                    entryPointPlaceholder: "https://login.microsoftonline.com/xxx/saml2",
                    issuer: "Azure Application ID",
                    issuerPlaceholder: "abc-def-ghi-jkl-mno"
                });
            case AuthProvider.JUMPCLOUD_SAML:
                return ({
                    acsUrl: "ACS URL",
                    entityId: "SP Entity ID",
                    entryPoint: "IDP URL",
                    entryPointPlaceholder: "https://sso.jumpcloud.com/saml2/xxx",
                    issuer: "IdP Entity ID",
                    issuerPlaceholder: "xxx"
                });
                
            default:
                return ({
                    acsUrl: "ACS URL",
                    entityId: "Entity ID",
                    entryPoint: "Entrypoint",
                    entryPointPlaceholder: "Enter entrypoint...",
                    issuer: "Issuer",
                    issuerPlaceholder: "Enter placeholder..."
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
                    {authProvider && data && (
                        <>
                            <div className="mb-4">
                                <h3 className="text-mineshaft-400 text-sm">{renderLabels(authProvider).acsUrl}</h3>
                                <p className="text-gray-400 text-md break-all">{`${window.origin}/api/v1/sso/saml2/${data._id}`}</p>
                            </div>
                            <div className="mb-4">
                                <h3 className="text-mineshaft-400 text-sm">{renderLabels(authProvider).entityId}</h3>
                                <p className="text-gray-400 text-md">{window.origin}</p>
                            </div>
                            <Controller
                                control={control}
                                name="entryPoint"
                                render={({ field, fieldState: { error } }) => (
                                    <FormControl
                                        label={renderLabels(authProvider).entryPoint}
                                        errorText={error?.message}
                                        isError={Boolean(error)}
                                    >
                                        <Input 
                                            {...field} 
                                            placeholder={renderLabels(authProvider).entryPointPlaceholder}
                                        />
                                    </FormControl>
                                )}
                            />
                            <Controller
                                control={control}
                                name="issuer"
                                render={({ field, fieldState: { error } }) => (
                                    <FormControl
                                        label={renderLabels(authProvider).issuer}
                                        errorText={error?.message}
                                        isError={Boolean(error)}
                                    >
                                        <Input 
                                            {...field} 
                                            placeholder={renderLabels(authProvider).issuerPlaceholder}
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