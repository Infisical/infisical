import { type ReactNode, useEffect } from "react";
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

const signUpFormSchema = formSchema.pick({
  signUpMode: true,
  allowedSignUpDomain: true
});
const defaultOrganizationFormSchema = formSchema.pick({ defaultAuthOrgId: true });
const trustLdapEmailsFormSchema = formSchema.pick({ trustLdapEmails: true });
const noticesFormSchema = formSchema.pick({ authConsentContent: true, pageFrameContent: true });

type TSignUpForm = z.infer<typeof signUpFormSchema>;
type TDefaultOrganizationForm = z.infer<typeof defaultOrganizationFormSchema>;
type TTrustLdapEmailsForm = z.infer<typeof trustLdapEmailsFormSchema>;
type TNoticesForm = z.infer<typeof noticesFormSchema>;

type GeneralSettingsCardProps = {
  title: string;
  description: string;
  children?: ReactNode;
  isSubmitting: boolean;
  isDirty: boolean;
};

const GeneralSettingsCard = ({
  title,
  description,
  children,
  isSubmitting,
  isDirty
}: GeneralSettingsCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    {children && <CardContent>{children}</CardContent>}
    <CardFooter className="justify-end border-t">
      <Button
        variant="neutral"
        size="sm"
        type="submit"
        isPending={isSubmitting}
        isDisabled={!isDirty}
      >
        Save
      </Button>
    </CardFooter>
  </Card>
);

type SignUpSettingsCardProps = {
  allowSignUp: boolean;
  allowedSignUpDomain: string;
};

const SignUpSettingsCard = ({ allowSignUp, allowedSignUpDomain }: SignUpSettingsCardProps) => {
  const { mutateAsync: updateServerConfig } = useUpdateServerConfig();
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting, isDirty }
  } = useForm<TSignUpForm>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: {
      // eslint-disable-next-line
      signUpMode: allowSignUp ? SignUpModes.Anyone : SignUpModes.Disabled,
      allowedSignUpDomain
    }
  });

  useEffect(() => {
    reset({
      // eslint-disable-next-line
      signUpMode: allowSignUp ? SignUpModes.Anyone : SignUpModes.Disabled,
      allowedSignUpDomain
    });
  }, [allowSignUp, allowedSignUpDomain, reset]);

  const signUpMode = watch("signUpMode");
  const onFormSubmit = async (formData: TSignUpForm) => {
    await updateServerConfig({
      allowSignUp: formData.signUpMode !== SignUpModes.Disabled,
      allowedSignUpDomain:
        formData.signUpMode === SignUpModes.Anyone ? formData.allowedSignUpDomain : null
    });
    reset(formData);
    createNotification({
      text: "Signup settings updated.",
      type: "success"
    });
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
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
          {signUpMode === SignUpModes.Anyone && (
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
    </form>
  );
};

type DefaultOrganizationSettingsCardProps = {
  defaultAuthOrgId: string;
};

const DefaultOrganizationSettingsCard = ({
  defaultAuthOrgId
}: DefaultOrganizationSettingsCardProps) => {
  const organizations = useGetOrganizations();
  const { mutateAsync: updateServerConfig } = useUpdateServerConfig();
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<TDefaultOrganizationForm>({
    resolver: zodResolver(defaultOrganizationFormSchema),
    defaultValues: {
      defaultAuthOrgId
    }
  });

  useEffect(() => {
    reset({ defaultAuthOrgId });
  }, [defaultAuthOrgId, reset]);

  const onFormSubmit = async (formData: TDefaultOrganizationForm) => {
    await updateServerConfig({
      defaultAuthOrgId: formData.defaultAuthOrgId || null
    });
    reset(formData);
    createNotification({
      text: "Default organization updated.",
      type: "success"
    });
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
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
    </form>
  );
};

type TrustLdapEmailsSettingsCardProps = {
  trustLdapEmails: boolean;
};

const TrustLdapEmailsSettingsCard = ({ trustLdapEmails }: TrustLdapEmailsSettingsCardProps) => {
  const { mutateAsync: updateServerConfig } = useUpdateServerConfig();
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<TTrustLdapEmailsForm>({
    resolver: zodResolver(trustLdapEmailsFormSchema),
    defaultValues: {
      trustLdapEmails
    }
  });

  useEffect(() => {
    reset({ trustLdapEmails });
  }, [trustLdapEmails, reset]);

  const onFormSubmit = async (formData: TTrustLdapEmailsForm) => {
    await updateServerConfig(formData);
    reset(formData);
    createNotification({
      text: "LDAP email verification setting updated.",
      type: "success"
    });
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="trustLdapEmails"
        render={({ field }) => (
          <GeneralSettingsCard
            title="LDAP Email Verification"
            description="Choose whether users provisioned through LDAP must verify their email address on first login. SAML and OIDC users remain unaffected."
            isSubmitting={isSubmitting}
            isDirty={isDirty}
          >
            <div className="flex items-center gap-3">
              <Toggle
                id="trust-ldap-emails"
                aria-label="Trust LDAP emails"
                variant="neutral"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <FieldLabel
                htmlFor="trust-ldap-emails"
                className="cursor-pointer text-sm font-medium text-foreground"
              >
                Trust LDAP emails
              </FieldLabel>
            </div>
          </GeneralSettingsCard>
        )}
      />
    </form>
  );
};

type NoticesSettingsCardProps = {
  authConsentContent: string;
  pageFrameContent: string;
};

const NoticesSettingsCard = ({
  authConsentContent,
  pageFrameContent
}: NoticesSettingsCardProps) => {
  const { mutateAsync: updateServerConfig } = useUpdateServerConfig();
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<TNoticesForm>({
    resolver: zodResolver(noticesFormSchema),
    defaultValues: {
      authConsentContent,
      pageFrameContent
    }
  });

  useEffect(() => {
    reset({ authConsentContent, pageFrameContent });
  }, [authConsentContent, pageFrameContent, reset]);

  const onFormSubmit = async (formData: TNoticesForm) => {
    await updateServerConfig(formData);
    reset(formData);
    createNotification({
      text: "Notices updated.",
      type: "success"
    });
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
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

export const GeneralPageForm = () => {
  const { config } = useServerConfig();

  return (
    <div className="space-y-6">
      <SignUpSettingsCard
        allowSignUp={config.allowSignUp}
        allowedSignUpDomain={config.allowedSignUpDomain ?? ""}
      />
      <DefaultOrganizationSettingsCard defaultAuthOrgId={config.defaultAuthOrgId ?? ""} />
      <TrustLdapEmailsSettingsCard trustLdapEmails={config.trustLdapEmails ?? false} />
      <NoticesSettingsCard
        authConsentContent={config.authConsentContent ?? ""}
        pageFrameContent={config.pageFrameContent ?? ""}
      />
    </div>
  );
};
