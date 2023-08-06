import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
    Button,
    Checkbox
} from "@app/components/v2";
import { useUser } from "@app/context";
import {
    useUpdateUserAuthProviders
} from "@app/hooks/api";

const authMethods = [
    { label: "Email", value: "email" },
    { label: "Google SSO", value: "google" },
    { label: "GitHub SSO", value: "github" },
    { label: "Okta SAML", value: "okta-saml" },
    { label: "Azure SAML", value: "azure-saml" },
    { label: "JumpCloud SAML", value: "jumpcloud-saml" }
];

const schema = yup.object({
    authMethods: yup.array().required("Auth method is required")
});

export type FormData = yup.InferType<typeof schema>;

export const AuthMethodSection = () => {
    const { createNotification } = useNotificationContext();
    const { user } = useUser();
    const { mutateAsync, isLoading } = useUpdateUserAuthProviders();
    
    const {
        reset,
        handleSubmit,
        setValue,
        watch,
    } = useForm<FormData>({
        defaultValues: {
            authMethods: [user?.authProvider ?? "email"] 
        },
        resolver: yupResolver(schema)
    });
    
    const selectedAuthMethods = watch("authMethods");
    
    useEffect(() => {
        if (user) {
            reset({
                authMethods: [user?.authProvider ?? "email"]
            });
        }
    }, [user]);

    const onFormSubmit = async ({
        authMethods
    }: FormData) => {
        try {
            if (
                authMethods.includes("okta-saml")
                || authMethods.includes("azure-saml")
                || authMethods.includes("jumpcloud-saml")
            ) {
                createNotification({
                    text: "SAML authentication can only be configured in your organization settings",
                    type: "error"
                });
                
                return;
            }
            
            await mutateAsync({
                authProviders: authMethods
            });
            
            createNotification({
                text: "Successfully updated authentication method",
                type: "success"
            });
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to update authentication method",
                type: "error"
            });
        }
    }
    
    return (
        <form 
            className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600"
            onSubmit={handleSubmit(onFormSubmit)}
        >
           <h2 className="text-xl font-semibold flex-1 text-mineshaft-100 mb-8">
                Authentication Method
            </h2> 
            <div className="max-w-md mb-4">
                {
                    authMethods.map(authMethod => (
                        <Checkbox 
                            className="data-[state=checked]:bg-primary"
                            id={`auth-method-id-${authMethod.label}`}
                            key={`auth-method-${authMethod.label}`}
                            isChecked={selectedAuthMethods.includes(authMethod.value)}
                            onCheckedChange={(checked) => {
                            if (checked) {
                                setValue("authMethods", [
                                    ...selectedAuthMethods,
                                    authMethod.value
                                ])
                            } else {
                                setValue("authMethods", selectedAuthMethods.filter(auth => auth !== authMethod.value))
                            }
                        }}>
                            {authMethod.label}
                        </Checkbox>
                    ))
                }
            </div>

            <Button
                type="submit"
                colorSchema="secondary"
                isLoading={isLoading}
                isDisabled={isLoading}
            >
                Save
            </Button>
        </form>
    );
}
