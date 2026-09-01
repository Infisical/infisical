import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AtSign } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardContent,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldFeedback,
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
import { allowedEmailDomainsSchema } from "@app/helpers/email";
import { useGetOrganizations, useUpdateServerConfig } from "@app/hooks/api";

enum SignUpModes {
  Disabled = "disabled",
  Anyone = "anyone"
}

const formSchema = z.object({
  signUpMode: z.nativeEnum(SignUpModes),
  allowedSignUpDomain: allowedEmailDomainsSchema.optional().nullable(),
  trustLdapEmails: z.boolean(),
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
      trustLdapEmails: config.trustLdapEmails ?? false,
      defaultAuthOrgId: config.defaultAuthOrgId ?? "",
      authConsentContent: config.authConsentContent ?? "",
      pageFrameContent: config.pageFrameContent ?? ""
    }
  });

  const signUpMode = watch("signUpMode");
  const { mutateAsync: updateServerConfig } = useUpdateServerConfig();

  const organizations = useGetOrganizations();

  const onFormSubmit = async (formData: TDashboardForm) => {
    const { allowedSignUpDomain, trustLdapEmails, authConsentContent, pageFrameContent } = formData;

    await updateServerConfig({
      defaultAuthOrgId: formData.defaultAuthOrgId || null,
      allowSignUp: signUpMode !== SignUpModes.Disabled,
      allowedSignUpDomain: signUpMode === SignUpModes.Anyone ? allowedSignUpDomain : null,
      trustLdapEmails,
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
                  <Field className="max-w-sm" data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="allowed-signup-domains">Allowed email domains</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon>
                        <AtSign />
                      </InputGroupAddon>
                      <InputGroupInput
                        id="allowed-signup-domains"
                        {...field}
                        aria-describedby="allowed-signup-domains-feedback"
                        isError={Boolean(error)}
                        value={field.value || ""}
                        placeholder="gmail.com, aws.com, redhat.com"
                      />
                    </InputGroup>
                    <FieldFeedback
                      id="allowed-signup-domains-feedback"
                      description="Leave blank to allow any email domain."
                      error={error?.message}
                    />
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
            <Controller
              control={control}
              name="trustLdapEmails"
              render={({ field, fieldState: { error } }) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>Trust LDAP emails</FieldTitle>
                    <FieldDescription>
                      Trust email addresses provisioned by LDAP identity providers. When disabled,
                      LDAP users must verify their email address on first login. SAML and OIDC users
                      skip verification when their organization enforces SSO.
                    </FieldDescription>
                    <FieldError>{error?.message}</FieldError>
                  </FieldContent>
                  <Switch
                    id="trust-ldap-emails"
                    aria-label="Trust LDAP emails"
                    variant="neutral"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </Field>
              )}
            />

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
