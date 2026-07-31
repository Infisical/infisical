import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useRouter } from "@tanstack/react-router";
import axios from "axios";
import { Check, ChevronLeft, ChevronRight, type LucideIcon, Mail } from "lucide-react";
import { z } from "zod";

import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { OnboardingPageLayout } from "@app/components/auth/OnboardingPageLayout";
import {
  AnimatedCollapse,
  Button,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldFeedback,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  Input,
  RadioGroup,
  RadioGroupItem,
  Separator
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useOrganization, useServerConfig, useUser } from "@app/context";
import { allowedEmailDomainsSchema, normalizeAllowedEmailDomains } from "@app/helpers/email";
import { useOnboarding } from "@app/hooks";
import { useRenameUser, useUpdateOrg, useUpdateServerConfig } from "@app/hooks/api";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { GenericResourceNameSchema } from "@app/lib/schemas";

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
const setupFormId = "self-hosted-server-setup-form";
const authLockoutErrorMessage =
  "You must configure at least one auth method to prevent account lockout";

const formSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().optional(),
  organizationName: GenericResourceNameSchema,
  signUpMode: z.nativeEnum(SignUpMode),
  allowedSignUpDomain: allowedEmailDomainsSchema,
  enabledLoginMethods: z.nativeEnum(LoginMethod).array()
});

type TSetupForm = z.infer<typeof formSchema>;

const loginMethods: Array<{
  value: LoginMethod;
  label: string;
  icon?: LucideIcon;
  imageSrc?: string;
}> = [
  {
    value: LoginMethod.EMAIL,
    label: "Email",
    icon: Mail
  },
  {
    value: LoginMethod.GOOGLE,
    label: "Google",
    imageSrc: "/images/sso/Google.png"
  },
  {
    value: LoginMethod.GITHUB,
    label: "GitHub",
    imageSrc: "/images/integrations/GitHub.png"
  },
  {
    value: LoginMethod.GITLAB,
    label: "GitLab",
    imageSrc: "/images/integrations/GitLab.png"
  }
];

const identityProviderLoginMethods: LoginMethod[] = [
  LoginMethod.SAML,
  LoginMethod.OIDC,
  LoginMethod.LDAP
];

const formatAllowedDomains = (domains: string) =>
  normalizeAllowedEmailDomains(domains)
    .split(", ")
    .filter(Boolean)
    .map((domain) => `@${domain}`)
    .join(", ");

const stepContent = {
  [SetupStep.Account]: {
    title: "Super Admin account",
    description: "Review the account created for managing this instance."
  },
  [SetupStep.Organization]: {
    title: "Initial organization",
    description: "Review the first organization created on this instance."
  },
  [SetupStep.Access]: {
    title: "Control who can join",
    description: "Choose whether new users can create accounts on this instance."
  },
  [SetupStep.Review]: {
    title: "Review your settings",
    description: "Confirm the initial access and authentication configuration."
  }
} satisfies Record<SetupStep, { title: string; description: string }>;

export const SetupPage = () => {
  const navigate = useNavigate();
  const router = useRouter();
  const { config } = useServerConfig();
  const { user } = useUser();
  const { currentOrg } = useOrganization();
  const { mutateAsync: renameUser } = useRenameUser();
  const { mutateAsync: updateOrg } = useUpdateOrg();
  const { mutateAsync: updateServerConfig } = useUpdateServerConfig({
    handledErrorMessages: [authLockoutErrorMessage]
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
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      organizationName: currentOrg.name,
      signUpMode: config.allowSignUp ? SignUpMode.Anyone : SignUpMode.Disabled,
      allowedSignUpDomain: config.allowedSignUpDomain ?? "",
      enabledLoginMethods:
        config.enabledLoginMethods === null
          ? loginMethods.map(({ value }) => value)
          : config.enabledLoginMethods.filter((method) =>
              loginMethods.some(({ value }) => value === method)
            )
    }
  });

  const { activeStep, activeStepIndex, back, complete, isCompleting, next, setActiveStep } =
    useOnboarding({
      id: "self-hosted-server-setup",
      progressScope: user.id,
      steps,
      initialStep: SetupStep.Access,
      persistLocally: true,
      completionFlag: true,
      onPersistCompletion: async () => {
        await updateServerConfig({ onboardingCompleted: true });
      },
      onComplete: async () => {
        await router.invalidate();
        await navigate({ to: "/admin/welcome" });
      }
    });

  const values = watch();
  const onSubmit = handleSubmit(async (formData) => {
    if (activeStep === SetupStep.Account) {
      await renameUser({
        newName: [formData.firstName, formData.lastName].filter(Boolean).join(" ")
      });
      next();
      return;
    }

    if (activeStep === SetupStep.Organization) {
      await updateOrg({
        orgId: currentOrg.id,
        name: formData.organizationName
      });
      next();
      return;
    }

    if (activeStep === SetupStep.Access) {
      const enabledIdentityProviderMethods = (config.enabledLoginMethods ?? []).filter((method) =>
        identityProviderLoginMethods.includes(method)
      );
      const enabledLoginMethods = [
        ...formData.enabledLoginMethods,
        ...enabledIdentityProviderMethods
      ];

      if (enabledLoginMethods.length === 0) {
        setError("enabledLoginMethods", {
          message: "Select at least one login method."
        });
        return;
      }

      try {
        await updateServerConfig({
          allowSignUp: formData.signUpMode === SignUpMode.Anyone,
          allowedSignUpDomain:
            formData.signUpMode === SignUpMode.Anyone
              ? formData.allowedSignUpDomain.trim() || null
              : null,
          ...((config.enabledLoginMethods !== null || dirtyFields.enabledLoginMethods) && {
            enabledLoginMethods
          })
        });
      } catch (error) {
        if (
          axios.isAxiosError<{ message?: string }>(error) &&
          error.response?.data?.message === authLockoutErrorMessage
        ) {
          setError("enabledLoginMethods", {
            message: "Select at least one login method."
          });
          return;
        }

        throw error;
      }

      next();
      return;
    }

    await complete();
  });

  const renderStep = () => {
    if (activeStep === SetupStep.Account) {
      return (
        <FieldGroup>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.firstName)}>
              <FieldLabel className="sr-only" htmlFor="setup-first-name">
                First Name
              </FieldLabel>
              <Input
                {...register("firstName")}
                id="setup-first-name"
                placeholder="First Name"
                autoComplete="given-name"
                isError={Boolean(errors.firstName)}
              />
              <FieldError>{errors.firstName?.message}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.lastName)}>
              <FieldLabel className="sr-only" htmlFor="setup-last-name">
                Last Name
              </FieldLabel>
              <Input
                {...register("lastName")}
                id="setup-last-name"
                placeholder="Last Name"
                autoComplete="family-name"
                isError={Boolean(errors.lastName)}
              />
              <FieldError>{errors.lastName?.message}</FieldError>
            </Field>
          </div>
          <Field>
            <FieldLabel className="sr-only" htmlFor="setup-email">
              Email
            </FieldLabel>
            <Input
              id="setup-email"
              type="email"
              value={user.email ?? user.username}
              autoComplete="email"
              disabled
            />
            <FieldDescription>
              Email changes require verification and can be managed later in Personal Settings.
            </FieldDescription>
          </Field>
        </FieldGroup>
      );
    }

    if (activeStep === SetupStep.Organization) {
      return (
        <FieldGroup>
          <Field data-invalid={Boolean(errors.organizationName)}>
            <FieldLabel className="sr-only" htmlFor="setup-organization-name">
              Organization name
            </FieldLabel>
            <Input
              {...register("organizationName")}
              id="setup-organization-name"
              aria-label="Organization name"
              placeholder="Organization name"
              autoComplete="organization"
              autoFocus
              isError={Boolean(errors.organizationName)}
            />
            <FieldError>{errors.organizationName?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="setup-organization-slug">Organization slug</FieldLabel>
            <Input id="setup-organization-slug" value={currentOrg.slug} disabled />
            <FieldDescription>
              The organization slug was generated during instance creation.
            </FieldDescription>
          </Field>
        </FieldGroup>
      );
    }

    if (activeStep === SetupStep.Access) {
      return (
        <FieldGroup>
          <Controller
            control={control}
            name="signUpMode"
            render={({ field }) => (
              <Field>
                <h3 className="font-alliance text-base font-medium text-foreground">
                  Who can create accounts?
                </h3>
                <RadioGroup
                  value={field.value}
                  className="grid-cols-2"
                  onValueChange={field.onChange}
                >
                  <FieldLabel htmlFor="signup-disabled">
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle className="font-alliance text-base">Invite-only</FieldTitle>
                        <FieldDescription>Recommended for most instances.</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={SignUpMode.Disabled} id="signup-disabled" />
                    </Field>
                  </FieldLabel>
                  <FieldLabel htmlFor="signup-anyone">
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle className="gap-1 font-alliance text-base">
                          Anyone
                          <span aria-hidden="true" className="font-inter text-xs text-danger">
                            *
                          </span>
                        </FieldTitle>
                        <FieldDescription>Optionally limit by source/domain</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={SignUpMode.Anyone} id="signup-anyone" />
                    </Field>
                  </FieldLabel>
                </RadioGroup>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="enabledLoginMethods"
            render={({ field }) => (
              <Field>
                <div className="flex items-center gap-3">
                  <h3 className="shrink-0 font-alliance text-base font-medium text-foreground">
                    Allowed authentication methods
                  </h3>
                  <Separator className="flex-1" />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {loginMethods.map((method) => {
                    const isChecked = field.value.includes(method.value);
                    const MethodIcon = method.icon;

                    return (
                      <FieldLabel
                        key={method.value}
                        htmlFor={`login-method-${method.value}`}
                        className={cn(
                          "h-full transition-opacity",
                          !isChecked && "border-transparent opacity-60 hover:opacity-80"
                        )}
                      >
                        <Field orientation="horizontal" className="h-full items-center gap-2">
                          <div className="flex size-4 shrink-0 items-center justify-center text-muted">
                            {method.imageSrc ? (
                              <img
                                src={method.imageSrc}
                                alt=""
                                aria-hidden="true"
                                className="size-4 object-contain"
                              />
                            ) : (
                              MethodIcon && <MethodIcon className="size-4" />
                            )}
                          </div>
                          <FieldTitle className="h-4 text-sm leading-none">
                            {method.label}
                          </FieldTitle>
                          <Checkbox
                            id={`login-method-${method.value}`}
                            aria-label={method.label}
                            variant="project"
                            isChecked={isChecked}
                            onCheckedChange={(checked) => {
                              clearErrors("enabledLoginMethods");
                              field.onChange(
                                checked
                                  ? [...field.value, method.value]
                                  : field.value.filter((value) => value !== method.value)
                              );
                            }}
                          />
                        </Field>
                      </FieldLabel>
                    );
                  })}
                </div>
                <FieldDescription>
                  SAML, LDAP, and OIDC can be configured after onboarding in the Server Console.
                </FieldDescription>
                <FieldError>{errors.enabledLoginMethods?.message}</FieldError>
              </Field>
            )}
          />

          <AnimatedCollapse
            isOpen={values.signUpMode === SignUpMode.Anyone}
            contentClassName="-m-2 p-2"
          >
            <Controller
              control={control}
              name="allowedSignUpDomain"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="allowed-signup-domain" className="text-xs">
                    <span>
                      <span aria-hidden="true" className="mr-1 text-danger">
                        *
                      </span>
                      Limit allowed email domains{" "}
                      <span className="opacity-60">
                        (recommended, applies to all sign-up methods)
                      </span>
                    </span>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="allowed-signup-domain"
                    aria-describedby="allowed-signup-domain-feedback"
                    isError={Boolean(error)}
                    placeholder="acme.com, example.com"
                  />
                  <FieldFeedback
                    id="allowed-signup-domain-feedback"
                    description="Leave blank to allow any email domain."
                    error={error?.message}
                  />
                </Field>
              )}
            />
          </AnimatedCollapse>
        </FieldGroup>
      );
    }

    const enabledMethodLabels = loginMethods
      .filter(({ value }) => values.enabledLoginMethods.includes(value))
      .map(({ label }) => label)
      .join(", ");
    const allowedDomains = formatAllowedDomains(values.allowedSignUpDomain);
    let signUpSummary = "Anyone can sign up";
    if (values.signUpMode === SignUpMode.Disabled) {
      signUpSummary = "Invitation only";
    } else if (allowedDomains) {
      signUpSummary = `Signups limited to following domains: ${allowedDomains}`;
    }
    const reviewItems = [
      {
        step: SetupStep.Account,
        title: "Super Admin account",
        description: [
          [values.firstName, values.lastName].filter(Boolean).join(" "),
          user.email ?? user.username
        ]
          .filter(Boolean)
          .join(" · ")
      },
      {
        step: SetupStep.Organization,
        title: "Initial organization",
        description: values.organizationName
      },
      {
        step: SetupStep.Access,
        title: "User access",
        description: signUpSummary
      },
      {
        step: SetupStep.Access,
        title: "Login methods",
        description: enabledMethodLabels
      }
    ];

    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {reviewItems.map((item, index) => (
          <button
            key={item.title}
            type="button"
            className={cn(
              "group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 p-4 text-left transition-colors hover:bg-container-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              index < reviewItems.length - 1 && "border-b border-border"
            )}
            onClick={() => setActiveStep(item.step)}
          >
            <Check className="mt-0.5 size-4 text-success" />
            <span>
              <span className="block text-sm font-medium text-foreground">{item.title}</span>
              <span className="block text-sm leading-relaxed text-muted">{item.description}</span>
            </span>
            <ChevronRight className="size-4 self-center text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </button>
        ))}
      </div>
    );
  };

  return (
    <OnboardingPageLayout
      variant="focused"
      currentStep={activeStepIndex + 1}
      totalSteps={steps.length}
      contentClassName="max-w-xl"
      showFooter={false}
      anchorBottomContent
      bottomContent={
        <div className="mx-auto flex w-full max-w-xl justify-between gap-3">
          {activeStepIndex > 0 && (
            <Button type="button" variant="outline" onClick={back}>
              <ChevronLeft />
              Back
            </Button>
          )}
          <Button
            type="submit"
            form={setupFormId}
            variant="project"
            isPending={isSubmitting || isCompleting}
            className={cn(activeStepIndex === 0 && "ml-auto")}
          >
            {activeStep === SetupStep.Review ? "Finish setup" : "Continue"}
          </Button>
        </div>
      }
    >
      <Helmet>
        <title>Configure your instance | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <AuthPagePanel>
        <form id={setupFormId} onSubmit={onSubmit}>
          <CardHeader className="mb-8 gap-2">
            <CardTitle className="font-alliance text-3xl leading-tight font-normal">
              {stepContent[activeStep].title}
            </CardTitle>
            <CardDescription className="font-alliance text-base leading-relaxed">
              {stepContent[activeStep].description}
            </CardDescription>
          </CardHeader>

          <CardContent>{renderStep()}</CardContent>
        </form>
      </AuthPagePanel>
    </OnboardingPageLayout>
  );
};
