import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { faGithub, faGitlab, faGoogle, IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faEnvelope } from "@fortawesome/free-regular-svg-icons";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Switch } from "@app/components/v2";
import { useServerConfig } from "@app/context";
import { useUpdateServerConfig } from "@app/hooks/api";
import { AuthMethod } from "@app/hooks/api/admin/types";

interface AuthMethodOption {
  label: string;
  value: AuthMethod;
  icon: IconDefinition;
}

const authMethodOpts: AuthMethodOption[] = [
  { label: "Email", value: AuthMethod.EMAIL, icon: faEnvelope },
  { label: "Google", value: AuthMethod.GOOGLE, icon: faGoogle },
  { label: "GitHub", value: AuthMethod.GITHUB, icon: faGithub },
  { label: "GitLab", value: AuthMethod.GITLAB, icon: faGitlab },
  { label: "SAML", value: AuthMethod.SAML, icon: faLock }
];

const schema = z.object({
  disabledAuthMethods: z.array(z.nativeEnum(AuthMethod))
});

export type FormData = z.infer<typeof schema>;

export const AuthMethodSection = () => {
  const { createNotification } = useNotificationContext();
  const { config } = useServerConfig();
  const { mutateAsync } = useUpdateServerConfig();

  const { reset, setValue, watch } = useForm<FormData>({
    defaultValues: {
      disabledAuthMethods: config.disabledAuthMethods || []
    },
    resolver: zodResolver(schema)
  });

  const disabledAuthMethods = watch("disabledAuthMethods");

  useEffect(() => {
    if (config) {
      reset({
        disabledAuthMethods: config.disabledAuthMethods || []
      });
    }
  }, [config]);

  const onAuthMethodToggle = async (value: boolean, authMethodOpt: AuthMethodOption) => {
    const newDisabledAuthMethods = value
      ? disabledAuthMethods.filter((auth) => auth !== authMethodOpt.value)
      : [...disabledAuthMethods, authMethodOpt.value];

    if (value) {
      const newUser = await mutateAsync({
        disabledAuthMethods: newDisabledAuthMethods
      });

      setValue("disabledAuthMethods", newUser.disabledAuthMethods);
      createNotification({
        text: "Successfully enabled authentication method",
        type: "success"
      });
      return;
    }

    if (newDisabledAuthMethods.length === authMethodOpts.length) {
      createNotification({
        text: "You must keep at least 1 authentication method enabled",
        type: "error"
      });
      return;
    }

    const newConfig = await mutateAsync({
      disabledAuthMethods: newDisabledAuthMethods
    });

    setValue("disabledAuthMethods", newConfig.disabledAuthMethods);
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
        Toggle the Authentication method to restrict/grant user access for logging in or registering
        on Infisical. This action take effect across all Infisical organizations.
      </p>
      <div className="mb-4">
        {config &&
          authMethodOpts.map((authMethodOpt) => {
            return (
              <div className="flex items-center p-4" key={`auth-method-${authMethodOpt.value}`}>
                <div className="flex items-center">
                  <FontAwesomeIcon icon={authMethodOpt.icon} className="mr-4" />
                </div>
                <Switch
                  id={`enable-${authMethodOpt.value}-auth`}
                  onCheckedChange={(value) => onAuthMethodToggle(value, authMethodOpt)}
                  isChecked={!disabledAuthMethods?.includes(authMethodOpt.value) ?? true}
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
