import type { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AtSign } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldFeedback,
  FieldGroup,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea,
  Toggle
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

type GeneralSettingsCardProps = {
  title: string;
  description: string;
  children?: ReactNode;
  action?: ReactNode;
  isSubmitting: boolean;
  isDirty: boolean;
};

const GeneralSettingsCard = ({
  title,
  description,
  children,
  action,
  isSubmitting,
  isDirty
}: GeneralSettingsCardProps) => (
  <Card className="gap-0 overflow-hidden p-0">
    <CardHeader className="p-6">
      <CardTitle className="font-alliance">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
      {action && <CardAction>{action}</CardAction>}
    </CardHeader>
    {children && <CardContent className="px-6 pb-6">{children}</CardContent>}
    <CardFooter className="min-h-8 justify-end border-t border-neutral/15 bg-neutral/5 p-4">
      <Button
        variant="neutral"
        size="sm"
        type="submit"
        isPending={isSubmitting}
        isDisabled={!isDirty}
      >
        Save changes
      </Button>
    </CardFooter>
  </Card>
);

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
    <form className="space-y-6" onSubmit={handleSubmit(onFormSubmit)}>
      <GeneralSettingsCard
        title="Allow User Signups"
        description="Choose whether users can sign up for this Infisical instance."
        isSubmitting={isSubmitting}
        isDirty={isDirty}
      >
        <FieldGroup>
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
        </FieldGroup>
      </GeneralSettingsCard>

      <GeneralSettingsCard
        title="Default Organization"
        description="Select the default organization you want to set for SAML, LDAP, OIDC, and GitHub logins. When selected, user logins will be automatically scoped to the selected organization."
        isSubmitting={isSubmitting}
        isDirty={isDirty}
      >
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
                <SelectTrigger id="default-auth-org" className="w-full" isError={Boolean(error)}>
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
      </GeneralSettingsCard>

      <Controller
        control={control}
        name="trustLdapEmails"
        render={({ field }) => (
          <GeneralSettingsCard
            title="Trust LDAP emails"
            description="Trust email addresses provisioned by LDAP identity providers. When disabled, LDAP users must verify their email address on first login. SAML and OIDC users skip verification when their organization enforces SSO."
            action={
              <Toggle
                id="trust-ldap-emails"
                aria-label="Trust LDAP emails"
                variant="neutral"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            }
            isSubmitting={isSubmitting}
            isDirty={isDirty}
          />
        )}
      />

      <GeneralSettingsCard
        title="Notices"
        description="Configure system-wide notification banners and security messages. These settings control the text displayed during authentication and throughout a user's session."
        isSubmitting={isSubmitting}
        isDirty={isDirty}
      >
        <FieldGroup>
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
        </FieldGroup>
      </GeneralSettingsCard>
    </form>
  );
};
