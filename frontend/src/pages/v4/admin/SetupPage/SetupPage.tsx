import { Controller, type Resolver, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatedCollapse } from "@infisical/cipher/ui/animated-collapse";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Media, Tile } from "@infisical/cipher/ui/item";
import { Label } from "@infisical/cipher/ui/label";
import { Grid, Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { ProgressSteps } from "@infisical/cipher/ui/progress";
import { RadioGroup, RadioGroupItem } from "@infisical/cipher/ui/radio-group";
import { SmallText } from "@infisical/cipher/ui/text";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import axios from "axios";
import { Mail } from "lucide-react";
import { z } from "zod";

import { allowedEmailDomainsSchema, normalizeAllowedEmailDomains } from "@app/helpers/email";
import { LoginMethod, SuperAdminErrorCode, type TServerConfig } from "@app/hooks/api/admin/types";
import type { Organization } from "@app/hooks/api/organization/types";
import type { User } from "@app/hooks/api/users/types";
import { useOnboarding } from "@app/hooks/useOnboarding";
import { GenericResourceNameSchema, normalizeSlugInput, slugSchema } from "@app/lib/schemas";

import { AuthPage } from "../../auth/components/AuthPage";
import { useV4Adapter } from "../../data/adapters";
import { useGo, v4Path } from "../../links";

import styles from "../../auth/auth.module.css";

enum SetupStep {
  Account = "account",
  Organization = "organization",
  Access = "access",
  Review = "review"
}

enum SignUpMode {
  Disabled = "disabled",
  Anyone = "anyone"
}

const steps = [
  SetupStep.Account,
  SetupStep.Organization,
  SetupStep.Access,
  SetupStep.Review
] as const;

const stepLabels = ["Account", "Organization", "Access", "Review"];

const formSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().optional(),
  organizationName: GenericResourceNameSchema,
  organizationSlug: slugSchema({ field: "Organization slug" }),
  signUpMode: z.nativeEnum(SignUpMode),
  allowedSignUpDomain: allowedEmailDomainsSchema,
  enabledLoginMethods: z.nativeEnum(LoginMethod).array().min(1, "Select at least one login method.")
});

type TSetupForm = z.infer<typeof formSchema>;

const stepSchemas = {
  [SetupStep.Account]: formSchema.pick({ firstName: true, lastName: true }).passthrough(),
  [SetupStep.Organization]: formSchema
    .pick({ organizationName: true, organizationSlug: true })
    .passthrough(),
  [SetupStep.Access]: formSchema
    .pick({ signUpMode: true, allowedSignUpDomain: true, enabledLoginMethods: true })
    .passthrough(),
  [SetupStep.Review]: formSchema
};

const logo = (src: string) => <img src={src} alt="" />;

const loginMethods = [
  { value: LoginMethod.EMAIL, label: "Email", media: <Icon icon={Mail} /> },
  { value: LoginMethod.GOOGLE, label: "Google", media: logo("/images/sso/Google.png") },
  { value: LoginMethod.GITHUB, label: "GitHub", media: logo("/images/integrations/GitHub.png") },
  { value: LoginMethod.GITLAB, label: "GitLab", media: logo("/images/integrations/GitLab.png") }
];

const stepContent: Record<SetupStep, { title: string; description?: string }> = {
  [SetupStep.Account]: {
    title: "Create a Super Admin account",
    description: "This account administers the instance."
  },
  [SetupStep.Organization]: {
    title: "Set up your first organization",
    description: "An instance can hold many organizations. This one is yours."
  },
  [SetupStep.Access]: {
    title: "Control who can join",
    description: "Choose whether new users can create accounts on this instance."
  },
  [SetupStep.Review]: { title: "Review your settings" }
};

const formatAllowedDomains = (domains: string) =>
  normalizeAllowedEmailDomains(domains)
    .split(", ")
    .filter(Boolean)
    .map((domain) => `@${domain}`)
    .join(", ");

const SetupFlow = ({
  user,
  organization,
  config
}: {
  user: User;
  organization: Organization;
  config: TServerConfig;
}) => {
  const router = useRouter();
  const go = useGo();
  const admin = useV4Adapter("admin");
  const renameUser = admin.useRenameUser();
  const updateOrganization = admin.useUpdateOrganization();
  const updateServerConfig = admin.useUpdateServerConfig({
    handledErrorCodes: [SuperAdminErrorCode.AuthMethodLockout]
  });
  const email = user.email ?? user.username;

  const { activeStep, activeStepIndex, back, complete, isCompleting, next, setActiveStep } =
    useOnboarding({
      id: "self-hosted-server-setup",
      progressScope: user.id,
      steps,
      initialStep: SetupStep.Access,
      persistLocally: true,
      completionFlag: true,
      onPersistCompletion: async () => {
        await updateServerConfig.mutateAsync({ onboardingCompleted: true });
      },
      onComplete: async () => {
        await router.invalidate();
        await go(v4Path("/admin/welcome"));
      }
    });

  const {
    clearErrors,
    control,
    handleSubmit,
    register,
    setError,
    watch,
    formState: { dirtyFields, errors, isSubmitting }
  } = useForm<TSetupForm>({
    resolver: zodResolver(stepSchemas[activeStep]) as Resolver<TSetupForm>,
    defaultValues: {
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      organizationName: organization.name,
      organizationSlug: organization.slug,
      signUpMode: config.allowSignUp ? SignUpMode.Anyone : SignUpMode.Disabled,
      allowedSignUpDomain: config.allowedSignUpDomain ?? "",
      enabledLoginMethods:
        config.enabledLoginMethods === null
          ? loginMethods.map(({ value }) => value)
          : config.enabledLoginMethods
    }
  });

  const values = watch();

  const onSubmit = handleSubmit(async (formData) => {
    try {
      if (activeStep === SetupStep.Account) {
        await renameUser.mutateAsync({
          newName: [formData.firstName, formData.lastName].filter(Boolean).join(" ")
        });
        next();
        return;
      }
      if (activeStep === SetupStep.Organization) {
        await updateOrganization.mutateAsync({
          orgId: organization.id,
          name: formData.organizationName,
          slug: formData.organizationSlug
        });
        next();
        return;
      }
      if (activeStep === SetupStep.Access) {
        await updateServerConfig.mutateAsync({
          allowSignUp: formData.signUpMode === SignUpMode.Anyone,
          allowedSignUpDomain:
            formData.signUpMode === SignUpMode.Anyone
              ? formData.allowedSignUpDomain.trim() || null
              : null,
          ...((config.enabledLoginMethods !== null || dirtyFields.enabledLoginMethods) && {
            enabledLoginMethods: formData.enabledLoginMethods
          })
        });
        next();
        return;
      }
      await complete();
    } catch (error) {
      if (
        axios.isAxiosError<{ error?: string }>(error) &&
        error.response?.data?.error === SuperAdminErrorCode.AuthMethodLockout
      ) {
        setError("enabledLoginMethods", { message: "Select at least one login method." });
      }
    }
  });

  const renderStep = () => {
    if (activeStep === SetupStep.Account)
      return (
        <Stack gap={16}>
          <div className={styles.split}>
            <Field label="First name" error={errors.firstName?.message}>
              <Input {...register("firstName")} size="lg" autoComplete="given-name" autoFocus />
            </Field>
            <Field label="Last name" optional error={errors.lastName?.message}>
              <Input {...register("lastName")} size="lg" autoComplete="family-name" />
            </Field>
          </div>
          <Field
            label="Email"
            description="Email changes need verification, so make them later in Personal settings."
          >
            <Input size="lg" type="email" value={email} autoComplete="email" readOnly />
          </Field>
        </Stack>
      );

    if (activeStep === SetupStep.Organization)
      return (
        <Stack gap={16}>
          <Field label="Organization name" error={errors.organizationName?.message}>
            <Input
              {...register("organizationName")}
              size="lg"
              autoComplete="organization"
              autoFocus
            />
          </Field>
          <Controller
            control={control}
            name="organizationSlug"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <Field
                label="Organization slug"
                description="Lowercase letters, numbers, and hyphens only. Spaces become hyphens."
                error={error?.message}
              >
                <Input
                  {...field}
                  size="lg"
                  mono
                  placeholder="acme"
                  autoComplete="off"
                  onChange={(event) => onChange(normalizeSlugInput(event.target.value))}
                />
              </Field>
            )}
          />
        </Stack>
      );

    if (activeStep === SetupStep.Access)
      return (
        <Stack gap={24}>
          <Controller
            control={control}
            name="signUpMode"
            render={({ field }) => (
              <Field label="Who can create accounts?" group>
                <RadioGroup
                  aria-label="Who can create accounts?"
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  {[
                    {
                      value: SignUpMode.Disabled,
                      label: "Invite only",
                      description: "Recommended for most instances."
                    },
                    {
                      value: SignUpMode.Anyone,
                      label: "Anyone",
                      description: "Optionally limited to email domains you allow."
                    }
                  ].map((option) => (
                    <Inline key={option.value} gap={12} align="start" wrap={false}>
                      <RadioGroupItem id={`signup-${option.value}`} value={option.value} />
                      <Stack gap={4}>
                        <Label htmlFor={`signup-${option.value}`}>{option.label}</Label>
                        <SmallText muted>{option.description}</SmallText>
                      </Stack>
                    </Inline>
                  ))}
                </RadioGroup>
              </Field>
            )}
          />
          <AnimatedCollapse open={values.signUpMode === SignUpMode.Anyone}>
            <Controller
              control={control}
              name="allowedSignUpDomain"
              render={({ field, fieldState: { error } }) => (
                <Field
                  label="Allowed email domains"
                  optional
                  description="Recommended. Applies to every sign-up method. Leave blank to allow any domain."
                  error={error?.message}
                >
                  <Input {...field} size="lg" placeholder="acme.com, example.com" />
                </Field>
              )}
            />
          </AnimatedCollapse>
          <Controller
            control={control}
            name="enabledLoginMethods"
            render={({ field }) => (
              <Field
                label="Allowed authentication methods"
                group
                description="Configure SAML, LDAP, and OIDC in the Server console after setup."
                error={errors.enabledLoginMethods?.message}
              >
                <Grid columns={4} gap={12}>
                  {loginMethods.map((method) => (
                    <Checkbox
                      key={method.value}
                      label={method.label}
                      media={method.media}
                      checked={field.value.includes(method.value)}
                      onChange={(checked) => {
                        clearErrors("enabledLoginMethods");
                        field.onChange(
                          checked
                            ? [...field.value, method.value]
                            : field.value.filter((value) => value !== method.value)
                        );
                      }}
                    />
                  ))}
                </Grid>
              </Field>
            )}
          />
        </Stack>
      );

    const allowedDomains = formatAllowedDomains(values.allowedSignUpDomain);
    let signUpSummary = "Anyone can sign up";
    if (values.signUpMode === SignUpMode.Disabled) signUpSummary = "Invite only";
    else if (allowedDomains) signUpSummary = `Sign-ups limited to ${allowedDomains}`;
    const reviewItems = [
      {
        step: SetupStep.Account,
        title: "Super Admin account",
        description: [[values.firstName, values.lastName].filter(Boolean).join(" "), email]
          .filter(Boolean)
          .join(", ")
      },
      {
        step: SetupStep.Organization,
        title: "Initial organization",
        description: `${values.organizationName} (${values.organizationSlug})`
      },
      { step: SetupStep.Access, title: "User access", description: signUpSummary },
      {
        step: SetupStep.Access,
        title: "Login methods",
        description: loginMethods
          .filter(({ value }) => values.enabledLoginMethods.includes(value))
          .map(({ label }) => label)
          .join(", ")
      }
    ];
    return (
      <Stack gap={8}>
        {reviewItems.map((item) => (
          <Tile
            key={item.title}
            media={<Media icon="check" tone="ok" />}
            title={item.title}
            description={item.description}
            onClick={() => setActiveStep(item.step)}
          />
        ))}
      </Stack>
    );
  };

  return (
    <AuthPage
      variant="focused"
      pageTitle="Configure Your Instance"
      title={stepContent[activeStep].title}
      description={stepContent[activeStep].description}
      progress={
        <ProgressSteps label="Set up your instance" steps={stepLabels} current={activeStepIndex} />
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <Stack gap={32}>
          {renderStep()}
          <Inline justify={activeStepIndex > 0 ? "between" : "end"}>
            {activeStepIndex > 0 && (
              <Button type="button" variant="outline" icon="chev-left" onClick={back}>
                Back
              </Button>
            )}
            <Button type="submit" variant="accent" loading={isSubmitting || isCompleting}>
              {activeStep === SetupStep.Review ? "Finish setup" : "Continue"}
            </Button>
          </Inline>
        </Stack>
      </form>
    </AuthPage>
  );
};

export const SetupPage = () => {
  const { organizationId } = useRouteContext({ from: "/v4/admin" });
  const admin = useV4Adapter("admin");
  const user = admin.useCurrentUser();
  const organizations = admin.useUserOrganizations();
  const config = admin.useServerConfig();
  const error = user.error ?? organizations.error ?? config.error;
  if (error) throw error;
  const organization = organizations.data?.find((entry) => entry.id === organizationId);
  if (!user.data || !organization || !config.data)
    return <Loader size="page" label="Loading your instance" className="flex-1" />;
  return <SetupFlow user={user.data} organization={organization} config={config.data} />;
};
