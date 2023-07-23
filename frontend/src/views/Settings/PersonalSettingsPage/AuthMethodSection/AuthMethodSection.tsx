import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
    Button,
    FormControl,
    Select,
    SelectItem} from "@app/components/v2";
import { useUser } from "@app/context";
import {
    useUpdateUserAuthProvider
} from "@app/hooks/api";

const authMethods = [
    { label: "Email", value: "email" },
    { label: "Google SSO", value: "google" },
    { label: "Okta SAML 2.0", value: "okta-saml" },
];

const schema = yup.object({
    authMethod: yup.string().required("Auth method is required")
});

export type FormData = yup.InferType<typeof schema>;

export const AuthMethodSection = () => {
    const { createNotification } = useNotificationContext();
    const { user } = useUser();
    const { mutateAsync, isLoading } = useUpdateUserAuthProvider();
    
    const {
        reset,
        control,
        handleSubmit
    } = useForm<FormData>({
        defaultValues: {
            authMethod: user?.authProvider ?? "email" 
        },
        resolver: yupResolver(schema)
    });
    
    useEffect(() => {
        if (user) {
            reset({
                authMethod: user?.authProvider ?? "email"
            });
        }
    }, [user]);

    const onFormSubmit = async ({
        authMethod
    }: FormData) => {
        try {
            if (authMethod === "okta-saml") {
                createNotification({
                    text: "Okta SAML 2.0 can only be configured in your organization settings",
                    type: "error"
                });
                
                return;
            }
            
            await mutateAsync({
                authProvider: authMethod
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
                <Controller
                    control={control}
                    name="authMethod"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                        <FormControl
                            className="mb-0"
                            errorText={error?.message}
                            isError={Boolean(error)}
                        >
                            <Select
                                defaultValue={field.value}
                                {...field}
                                onValueChange={(e) => onChange(e)}
                                className="w-full bg-mineshaft-800 border border-mineshaft-600"
                            >
                                {authMethods.map((authMethod) => {
                                    return (
                                        <SelectItem 
                                            value={authMethod.value} 
                                            key={`auth-method-${authMethod.value}`}
                                        >
                                            {authMethod.label}
                                        </SelectItem>
                                    );
                                })}
                        </Select>
                        </FormControl>
                    )}
                />
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