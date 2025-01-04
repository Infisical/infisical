import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { faGithub, faGitlab, faGoogle, IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faEnvelope } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Switch } from "@app/components/v2";
import { useServerConfig, useUser } from "@app/context";
import { useUpdateUserAuthMethods } from "@app/hooks/api";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { AuthMethod } from "@app/hooks/api/users/types";

interface AuthMethodOption {
  label: string;
  value: AuthMethod;
  icon: IconDefinition;
  loginMethod: LoginMethod;
}

const authMethodOpts: AuthMethodOption[] = [
  { label: "Email", value: AuthMethod.EMAIL, icon: faEnvelope, loginMethod: LoginMethod.EMAIL },
  { label: "Google", value: AuthMethod.GOOGLE, icon: faGoogle, loginMethod: LoginMethod.GOOGLE },
  { label: "GitHub", value: AuthMethod.GITHUB, icon: faGithub, loginMethod: LoginMethod.GITHUB },
  { label: "GitLab", value: AuthMethod.GITLAB, icon: faGitlab, loginMethod: LoginMethod.GITLAB }
];
const schema = z.object({
  authMethods: z.nativeEnum(AuthMethod).array()
});

export type FormData = z.infer<typeof schema>;

export const AuthMethodSection = () => {
  const { user } = useUser();
  const { config } = useServerConfig();
  const { mutateAsync } = useUpdateUserAuthMethods();

  const { reset, setValue, watch } = useForm<FormData>({
    defaultValues: {
      authMethods: user.authMethods
    },
    resolver: zodResolver(schema)
  });

  const authMethods = watch("authMethods");

  useEffect(() => {
    if (user) {
      reset({
        authMethods: user.authMethods
      });
    }
  }, [user]);

  const onAuthMethodToggle = async (value: boolean, authMethodOpt: AuthMethodOption) => {
    const newAuthMethods = value
      ? [...authMethods, authMethodOpt.value]
      : authMethods.filter((auth) => auth !== authMethodOpt.value);

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
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <h2 className="mb-8 flex-1 text-xl font-semibold text-mineshaft-100">
        Authentication methods
      </h2>
      <p className="mb-4 text-gray-400">
        By enabling a SSO provider, you are allowing an account with that provider which uses the
        same email address as your existing Infisical account to be able to log in to Infisical.
      </p>
      <div className="mb-4">
        {user &&
          authMethodOpts.map((authMethodOpt) => {
            // only filter when enabledLoginMethods is explicitly configured by admin
            if (
              config.enabledLoginMethods &&
              !config.enabledLoginMethods.includes(authMethodOpt.loginMethod)
            ) {
              return null;
            }

            return (
              <div className="flex items-center p-4" key={`auth-method-${authMethodOpt.value}`}>
                <div className="flex items-center">
                  <FontAwesomeIcon icon={authMethodOpt.icon} className="mr-4" />
                </div>
                <Switch
                  id={`enable-${authMethodOpt.value}-auth`}
                  onCheckedChange={(value) => onAuthMethodToggle(value, authMethodOpt)}
                  isChecked={authMethods?.includes(authMethodOpt.value) ?? false}
                >
                  <p className="mr-4 w-12">{authMethodOpt.label}</p>
                </Switch>
              </div>
            );
          })}
      </div>
    </div>
  );
};
