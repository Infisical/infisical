import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldTitle,
  Switch
} from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { useUpdateServerConfig } from "@app/hooks/api";
import { LoginMethod } from "@app/hooks/api/admin/types";

const formSchema = z.object({
  isEmailEnabled: z.boolean(),
  isGoogleEnabled: z.boolean(),
  isGithubEnabled: z.boolean(),
  isGitlabEnabled: z.boolean(),
  isSamlEnabled: z.boolean(),
  isLdapEnabled: z.boolean(),
  isOidcEnabled: z.boolean()
});

type TAuthForm = z.infer<typeof formSchema>;

const loginMethods: Array<{
  id: string;
  label: string;
  name: keyof TAuthForm;
}> = [
  { id: "email-enabled", label: "Email", name: "isEmailEnabled" },
  { id: "google-enabled", label: "Google SSO", name: "isGoogleEnabled" },
  { id: "enable-github", label: "GitHub SSO", name: "isGithubEnabled" },
  { id: "enable-gitlab", label: "GitLab SSO", name: "isGitlabEnabled" },
  { id: "enable-saml", label: "SAML SSO", name: "isSamlEnabled" },
  { id: "enable-oidc", label: "OIDC SSO", name: "isOidcEnabled" },
  { id: "enable-ldap", label: "LDAP", name: "isLdapEnabled" }
];

export const AuthenticationPageForm = () => {
  const { config } = useServerConfig();
  const { enabledLoginMethods } = config;
  const { mutateAsync: updateServerConfig } = useUpdateServerConfig();

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = useForm<TAuthForm>({
    resolver: zodResolver(formSchema),
    // if not yet explicitly defined by the admin, all login methods should be enabled by default
    values: enabledLoginMethods
      ? {
          isEmailEnabled: enabledLoginMethods.includes(LoginMethod.EMAIL),
          isGoogleEnabled: enabledLoginMethods.includes(LoginMethod.GOOGLE),
          isGithubEnabled: enabledLoginMethods.includes(LoginMethod.GITHUB),
          isGitlabEnabled: enabledLoginMethods.includes(LoginMethod.GITLAB),
          isSamlEnabled: enabledLoginMethods.includes(LoginMethod.SAML),
          isLdapEnabled: enabledLoginMethods.includes(LoginMethod.LDAP),
          isOidcEnabled: enabledLoginMethods.includes(LoginMethod.OIDC)
        }
      : {
          isEmailEnabled: true,
          isGoogleEnabled: true,
          isGithubEnabled: true,
          isGitlabEnabled: true,
          isSamlEnabled: true,
          isLdapEnabled: true,
          isOidcEnabled: true
        }
  });

  const onAuthFormSubmit = async (formData: TAuthForm) => {
    const enabledMethods: LoginMethod[] = [];
    if (formData.isEmailEnabled) {
      enabledMethods.push(LoginMethod.EMAIL);
    }

    if (formData.isGoogleEnabled) {
      enabledMethods.push(LoginMethod.GOOGLE);
    }

    if (formData.isGithubEnabled) {
      enabledMethods.push(LoginMethod.GITHUB);
    }

    if (formData.isGitlabEnabled) {
      enabledMethods.push(LoginMethod.GITLAB);
    }

    if (formData.isSamlEnabled) {
      enabledMethods.push(LoginMethod.SAML);
    }

    if (formData.isLdapEnabled) {
      enabledMethods.push(LoginMethod.LDAP);
    }

    if (formData.isOidcEnabled) {
      enabledMethods.push(LoginMethod.OIDC);
    }

    if (!enabledMethods.length) {
      createNotification({
        type: "error",
        text: "At least one login method should be enabled."
      });
      return;
    }

    await updateServerConfig({
      enabledLoginMethods: enabledMethods
    });

    createNotification({
      text: "Login methods have been successfully updated.",
      type: "success"
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Login Methods</CardTitle>
        <CardDescription>
          Select the login methods available to all users of this instance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onAuthFormSubmit)}>
          <FieldGroup>
            {loginMethods.map(({ id, label, name }) => (
              <Controller
                key={name}
                control={control}
                name={name}
                render={({ field, fieldState: { error } }) => (
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>{label}</FieldTitle>
                      <FieldDescription>Allow users to authenticate with {label}.</FieldDescription>
                      <FieldError>{error?.message}</FieldError>
                    </FieldContent>
                    <Switch
                      id={id}
                      aria-label={label}
                      variant="neutral"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />
            ))}
          </FieldGroup>
          <Button
            variant="neutral"
            className="mt-6"
            type="submit"
            isPending={isSubmitting}
            isDisabled={!isDirty}
          >
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
