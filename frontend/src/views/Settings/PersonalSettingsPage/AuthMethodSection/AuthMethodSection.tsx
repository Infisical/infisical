import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { faGithub, faGoogle, IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faEnvelope } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Switch } from "@app/components/v2";
import { useUser } from "@app/context";
import { useUpdateUserAuthMethods } from "@app/hooks/api";
import {
    AuthMethod
} from "@app/hooks/api/users/types";

interface AuthMethodOption {
    label: string,
    value: AuthMethod,
    icon: IconDefinition;
}

const authMethodOpts: AuthMethodOption[] = [
    { label: "Email", value: AuthMethod.EMAIL, icon: faEnvelope },
    { label: "Google", value: AuthMethod.GOOGLE, icon: faGoogle },
    { label: "GitHub", value: AuthMethod.GITHUB, icon: faGithub }
];

const samlProviders = [AuthMethod.OKTA_SAML, AuthMethod.JUMPCLOUD_SAML, AuthMethod.AZURE_SAML];

const schema = yup.object({
    authMethods: yup.array().required("Auth method is required")
});

export type FormData = yup.InferType<typeof schema>;

export const AuthMethodSection = () => {
    const { createNotification } = useNotificationContext();
    const { user } = useUser();
    const { mutateAsync } = useUpdateUserAuthMethods();
    
    const {
        reset,
        setValue,
        watch,
    } = useForm<FormData>({
        defaultValues: {
            authMethods: user.authMethods,
        },
        resolver: yupResolver(schema)
    });
    
    const authMethods = watch("authMethods");
    
    useEffect(() => {
        if (user) {
            reset({
                authMethods: user.authMethods,
            });
        }
    }, [user]);
    
    const onAuthMethodToggle = async (value: boolean, authMethodOpt: AuthMethodOption) => {
        const hasSamlEnabled = user.authMethods
            .some((authMethod: AuthMethod) => samlProviders.includes(authMethod));

        if (hasSamlEnabled) {
            createNotification({
                text: "SAML authentication can only be configured in your organization settings",
                type: "error"
            });
        }
        
        const newAuthMethods = value 
            ? [...authMethods, authMethodOpt.value] 
            : authMethods.filter(auth => auth !== authMethodOpt.value);
        
        if (value) {
            const newUser = await mutateAsync({
                authMethods: newAuthMethods
            });

            setValue("authMethods", newUser.authMethods);
            createNotification({
                text: "Successfully enabled authentication method",
                type: "success"
            });
            return;
        }
        
        if (newAuthMethods.length === 0) {
            createNotification({
                text: "You must keep at least 1 authentication method enabled",
                type: "error"
            });
            return;
        }
        
        const newUser = await mutateAsync({
            authMethods: newAuthMethods
        });
        
        setValue("authMethods", newUser.authMethods);
        createNotification({
            text: "Successfully disabled authentication method",
            type: "success"
        });
    }
    
    return (
        <div className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600">
            <h2 className="text-xl font-semibold flex-1 text-mineshaft-100 mb-8">
                Authentication methods
            </h2> 
            <p className="text-gray-400 mb-4">
                By enabling a SSO provider, you are allowing an account with that provider which uses the same email address as your existing Infisical account to be able to log in to Infisical.
            </p>
            <div className="mb-4">
                {user && authMethodOpts.map((authMethodOpt) => {
                    return (
                        <div className="flex p-4 items-center" key={`auth-method-${authMethodOpt.value}`}>
                            <div className="flex items-center">
                                <FontAwesomeIcon icon={authMethodOpt.icon} className="mr-4" />
                            </div>
                            <Switch
                                id={`enable-${authMethodOpt.value}-auth`}
                                onCheckedChange={(value) => onAuthMethodToggle(value, authMethodOpt)}
                                isChecked={authMethods?.includes(authMethodOpt.value) ?? false}
                            >
                                <p className="w-12 mr-4">{authMethodOpt.label}</p>
                            </Switch>
                        </div>
                    ); 
                })}
            </div>
        </div>
    );
}
