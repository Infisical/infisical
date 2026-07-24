import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AtSign } from "lucide-react";
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
  FieldLabel,
  FieldTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  TextArea
} from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { useGetOrganizations, useUpdateServerConfig } from "@app/hooks/api";

enum SignUpModes {
  Disabled = "disabled",
  Anyone = "anyone"
}

const formSchema = z.object({
  signUpMode: z.nativeEnum(SignUpModes),
  allowedSignUpDomain: z.string().optional().nullable(),
  trustSamlEmails: z.boolean(),
  trustLdapEmails: z.boolean(),
  trustOidcEmails: z.boolean(),
  defaultAuthOrgId: z.string(),
  authConsentContent: z.string().optional().default(""),
  pageFrameContent: z.string().optional().default("")
});

type TDashboardForm = z.infer<typeof formSchema>;

export const GeneralPageForm = () => {
  const data = useServerConfig();
  const { config } = data;

  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting, isDirty }
  } = useForm<TDashboardForm>({
    resolver: zodResolver(formSchema),
    values: {
      // eslint-disable-next-line
      signUpMode: config.allowSignUp ? SignUpModes.Anyone : SignUpModes.Disabled,
      allowedSignUpDomain: config.allowedSignUpDomain,
      trustSamlEmails: config.trustSamlEmails ?? false,
      trustLdapEmails: config.trustLdapEmails ?? false,
      trustOidcEmails: config.trustOidcEmails ?? false,
      defaultAuthOrgId: config.defaultAuthOrgId ?? "",
      authConsentContent: config.authConsentContent ?? "",
      pageFrameContent: config.pageFrameContent ?? ""
    }
  });

  const signUpMode = watch("signUpMode");
  const { mutateAsync: updateServerConfig } = useUpdateServerConfig();

  const organizations = useGetOrganizations();

  const onFormSubmit = async (formData: TDashboardForm) => {
    const {
      allowedSignUpDomain,
      trustSamlEmails,
      trustLdapEmails,
      trustOidcEmails,
      authConsentContent,
      pageFrameContent
    } = formData;

    await updateServerConfig({
      defaultAuthOrgId: formData.defaultAuthOrgId || null,
      allowSignUp: signUpMode !== SignUpModes.Disabled,
      allowedSignUpDomain: signUpMode === SignUpModes.Anyone ? allowedSignUpDomain : null,
      trustSamlEmails,
      trustLdapEmails,
      trustOidcEmails,
      authConsentContent,
      pageFrameContent
    });
    createNotification({
      text: "Successfully changed sign up setting.",
      type: "success"
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instance Settings</CardTitle>
        <CardDescription>
          Configure signups, authentication defaults, trusted identities, and instance notices.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <FieldGroup>
            <div>
              <FieldTitle>Allow User Signups</FieldTitle>
              <FieldDescription>
                Choose whether users can sign up for this Infisical instance.
              </FieldDescription>
            </div>
            <Controller
              control={control}
              name="signUpMode"
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <Field className="max-w-sm">
                  <FieldLabel htmlFor="signup-mode">Signup mode</FieldLabel>
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger id="signup-mode" className="w-full" isError={Boolean(error)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SignUpModes.Disabled}>Disabled</SelectItem>
                      <SelectItem value={SignUpModes.Anyone}>Anyone</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            {signUpMode === "anyone" && (
              <Controller
                control={control}
                defaultValue=""
                name="allowedSignUpDomain"
                render={({ field, fieldState: { error } }) => (
                  <Field className="max-w-sm">
                    <FieldLabel htmlFor="allowed-signup-domains">Allowed email domains</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon>
                        <AtSign />
                      </InputGroupAddon>
                      <InputGroupInput
                        id="allowed-signup-domains"
                        {...field}
                        value={field.value || ""}
                        placeholder="gmail.com, aws.com, redhat.com"
                      />
                    </InputGroup>
                    <FieldDescription>Leave blank to allow any email domain.</FieldDescription>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            )}

            <Separator />
            <div>
              <FieldTitle>Default Organization</FieldTitle>
              <FieldDescription>
                Select the default organization you want to set for SAML/LDAP/OIDC/Github logins.
                When selected, user logins will be automatically scoped to the selected
                organization.
              </FieldDescription>
            </div>
            <Controller
              control={control}
              name="defaultAuthOrgId"
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <Field className="max-w-sm">
                  <FieldLabel htmlFor="default-auth-org">Organization</FieldLabel>
                  <Select
                    value={value || "all"}
                    onValueChange={(next) => onChange(next === "all" ? "" : next)}
                  >
                    <SelectTrigger
                      id="default-auth-org"
                      className="w-full"
                      isError={Boolean(error)}
                    >
                      <SelectValue placeholder="Allow all organizations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Allow all organizations</SelectItem>
                      {organizations.data?.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />

            <Separator />
            <div>
              <FieldTitle>Trust Emails</FieldTitle>
              <FieldDescription>
                Select if you want Infisical to trust external emails from SAML/LDAP/OIDC identity
                providers. If set to false, then Infisical will prompt SAML/LDAP/OIDC provisioned
                users to verify their email upon their first login.
              </FieldDescription>
            </div>
            {(
              [
                ["trustSamlEmails", "SAML"],
                ["trustLdapEmails", "LDAP"],
                ["trustOidcEmails", "OIDC"]
              ] as const
            ).map(([name, label]) => (
              <Controller
                key={name}
                control={control}
                name={name}
                render={({ field, fieldState: { error } }) => (
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>Trust {label} emails</FieldTitle>
                      <FieldError>{error?.message}</FieldError>
                    </FieldContent>
                    <Switch
                      id={`trust-${label.toLowerCase()}-emails`}
                      aria-label={`Trust ${label} emails`}
                      variant="neutral"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />
            ))}

            <Separator />
            <div>
              <FieldTitle>Notices</FieldTitle>
              <FieldDescription>
                Configure system-wide notification banners and security messages. These settings
                control the text displayed during authentication and throughout a user&apos;s
                session.
              </FieldDescription>
            </div>
            <Controller
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="auth-consent-content">Auth consent content</FieldLabel>
                  <TextArea
                    id="auth-consent-content"
                    placeholder="**Auth Consent Message**"
                    {...field}
                    rows={3}
                    className="h-48 max-w-lg resize-none"
                  />
                  <FieldDescription>Supports HTML, Markdown, and plain text.</FieldDescription>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
              control={control}
              name="authConsentContent"
            />
            <Controller
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="page-frame-content">Page frame content</FieldLabel>
                  <TextArea
                    id="page-frame-content"
                    placeholder='<div style="background-color: red">TOP SECRET</div>'
                    {...field}
                    rows={3}
                    className="h-48 max-w-lg resize-none"
                  />
                  <FieldDescription>Supports HTML, Markdown, and plain text.</FieldDescription>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
              control={control}
              name="pageFrameContent"
            />
            <Button variant="neutral" type="submit" isPending={isSubmitting} isDisabled={!isDirty}>
              Save
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
};
