import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { faGithub, faGitlab, faGoogle, IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faEnvelope } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Switch
} from "@app/components/v3";
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
  const { mutateAsync, isPending } = useUpdateUserAuthMethods();

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

    try {
      const newUser = await mutateAsync({
        authMethods: newAuthMethods
      });

      setValue("authMethods", newUser.authMethods);
      createNotification({
        text: `${authMethodOpt.label} authentication ${value ? "enabled" : "disabled"}.`,
        type: "success"
      });
    } catch {
      createNotification({
        text: `Failed to ${value ? "enable" : "disable"} ${authMethodOpt.label} authentication.`,
        type: "error"
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authentication Methods</CardTitle>
        <CardDescription>
          Choose which providers can sign in to your Infisical account using the same email address.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {user &&
          authMethodOpts.map((authMethodOpt) => {
            // only filter when enabledLoginMethods is explicitly configured by admin
            if (
              config.enabledLoginMethods &&
              !config.enabledLoginMethods.includes(authMethodOpt.loginMethod)
            ) {
              return null;
            }

            const isEnabled = authMethods?.includes(authMethodOpt.value) ?? false;
            const isOnlyMethod = isEnabled && authMethods.length === 1;
            const descriptionId = `enable-${authMethodOpt.value}-auth-description`;

            return (
              <Field
                orientation="horizontal"
                className="py-4"
                key={`auth-method-${authMethodOpt.value}`}
                data-disabled={isPending || isOnlyMethod}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <FontAwesomeIcon icon={authMethodOpt.icon} className="size-4" />
                  <FieldContent>
                    <FieldLabel
                      htmlFor={`enable-${authMethodOpt.value}-auth`}
                      className="cursor-pointer text-sm font-medium text-foreground"
                    >
                      {authMethodOpt.label}
                    </FieldLabel>
                    <FieldDescription id={descriptionId}>
                      {isOnlyMethod
                        ? "Keep at least one authentication method enabled."
                        : `Allow sign-in with ${authMethodOpt.label}.`}
                    </FieldDescription>
                  </FieldContent>
                </div>
                <Switch
                  id={`enable-${authMethodOpt.value}-auth`}
                  onCheckedChange={(value) => onAuthMethodToggle(value, authMethodOpt)}
                  checked={isEnabled}
                  disabled={isPending || isOnlyMethod}
                  aria-describedby={descriptionId}
                  variant="neutral"
                />
              </Field>
            );
          })}
      </CardContent>
    </Card>
  );
};
