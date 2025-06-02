import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Switch } from "@app/components/v2";
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
    try {
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
    } catch (e) {
      console.error(e);
      createNotification({
        type: "error",
        text: "Failed to update login methods."
      });
    }
  };

  return (
    <form
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
      onSubmit={handleSubmit(onAuthFormSubmit)}
    >
      <div className="flex flex-col justify-start">
        <div className="mb-2 text-xl font-semibold text-mineshaft-100">Login Methods</div>
        <div className="mb-4 max-w-sm text-sm text-mineshaft-400">
          Select the login methods you wish to allow for all users of this instance.
        </div>
        <Controller
          control={control}
          name="isEmailEnabled"
          render={({ field, fieldState: { error } }) => {
            return (
              <FormControl isError={Boolean(error)} errorText={error?.message}>
                <Switch
                  id="email-enabled"
                  onCheckedChange={(value) => field.onChange(value)}
                  isChecked={field.value}
                >
                  <p className="w-24">Email</p>
                </Switch>
              </FormControl>
            );
          }}
        />
        <Controller
          control={control}
          name="isGoogleEnabled"
          render={({ field, fieldState: { error } }) => {
            return (
              <FormControl isError={Boolean(error)} errorText={error?.message}>
                <Switch
                  id="google-enabled"
                  onCheckedChange={(value) => field.onChange(value)}
                  isChecked={field.value}
                >
                  <p className="w-24">Google SSO</p>
                </Switch>
              </FormControl>
            );
          }}
        />
        <Controller
          control={control}
          name="isGithubEnabled"
          render={({ field, fieldState: { error } }) => {
            return (
              <FormControl isError={Boolean(error)} errorText={error?.message}>
                <Switch
                  id="enable-github"
                  onCheckedChange={(value) => field.onChange(value)}
                  isChecked={field.value}
                >
                  <p className="w-24">Github SSO</p>
                </Switch>
              </FormControl>
            );
          }}
        />
        <Controller
          control={control}
          name="isGitlabEnabled"
          render={({ field, fieldState: { error } }) => {
            return (
              <FormControl isError={Boolean(error)} errorText={error?.message}>
                <Switch
                  id="enable-gitlab"
                  onCheckedChange={(value) => field.onChange(value)}
                  isChecked={field.value}
                >
                  <p className="w-24">Gitlab SSO</p>
                </Switch>
              </FormControl>
            );
          }}
        />
        <Controller
          control={control}
          name="isSamlEnabled"
          render={({ field, fieldState: { error } }) => {
            return (
              <FormControl isError={Boolean(error)} errorText={error?.message}>
                <Switch
                  id="enable-saml"
                  onCheckedChange={(value) => field.onChange(value)}
                  isChecked={field.value}
                >
                  <p className="w-24">SAML SSO</p>
                </Switch>
              </FormControl>
            );
          }}
        />
        <Controller
          control={control}
          name="isOidcEnabled"
          render={({ field, fieldState: { error } }) => {
            return (
              <FormControl isError={Boolean(error)} errorText={error?.message}>
                <Switch
                  id="enable-oidc"
                  onCheckedChange={(value) => field.onChange(value)}
                  isChecked={field.value}
                >
                  <p className="w-24">OIDC SSO</p>
                </Switch>
              </FormControl>
            );
          }}
        />
      </div>
      <Controller
        control={control}
        name="isLdapEnabled"
        render={({ field, fieldState: { error } }) => {
          return (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Switch
                id="enable-ldap"
                onCheckedChange={(value) => field.onChange(value)}
                isChecked={field.value}
              >
                <p className="w-24">LDAP</p>
              </Switch>
            </FormControl>
          );
        }}
      />
      <Button
        className="mt-2"
        type="submit"
        isLoading={isSubmitting}
        isDisabled={isSubmitting || !isDirty}
      >
        Save
      </Button>
    </form>
  );
};
