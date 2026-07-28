import { useMemo } from "react";
import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Check, ChevronLeft, type LucideIcon, Mail } from "lucide-react";
import { z } from "zod";

import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { OnboardingPageLayout } from "@app/components/auth/OnboardingPageLayout";
import { createNotification } from "@app/components/notifications";
import {
  AnimatedCollapse,
  Button,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  Input,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { useOnboarding } from "@app/hooks";
import { useGetOrganizations, useUpdateServerConfig } from "@app/hooks/api";
import { LoginMethod } from "@app/hooks/api/admin/types";

enum SetupStep {
  Access = "access",
  IdentityRouting = "identity-routing",
  Review = "review"
}

enum SignUpMode {
  Disabled = "disabled",
  Anyone = "anyone"
}

const steps = [SetupStep.Access, SetupStep.IdentityRouting, SetupStep.Review] as const;

const formSchema = z.object({
  signUpMode: z.nativeEnum(SignUpMode),
  allowedSignUpDomain: z.string(),
  enabledLoginMethods: z.nativeEnum(LoginMethod).array().min(1, {
    message: "Select at least one login method."
  }),
  defaultAuthOrgId: z.string()
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

const stepContent = {
  [SetupStep.Access]: {
    title: "Control who can join",
    description: "Choose whether new users can create accounts on this instance."
  },
  [SetupStep.IdentityRouting]: {
    title: "Route external identities",
    description: "Choose where users land after authenticating through an external provider."
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
  const organizations = useGetOrganizations();
  const { mutateAsync: updateServerConfig } = useUpdateServerConfig();

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<TSetupForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      signUpMode: config.allowSignUp ? SignUpMode.Anyone : SignUpMode.Disabled,
      allowedSignUpDomain: config.allowedSignUpDomain ?? "",
      enabledLoginMethods:
        config.enabledLoginMethods?.filter((method) =>
          loginMethods.some(({ value }) => value === method)
        ) ?? [LoginMethod.EMAIL],
      defaultAuthOrgId: config.defaultAuthOrgId ?? ""
    }
  });

  const { activeStep, activeStepIndex, back, complete, isCompleting, next } = useOnboarding({
    id: "self-hosted-server-setup",
    steps,
    persistLocally: true,
    completionFlag: true,
    onPersistCompletion: async () => {
      await updateServerConfig({ onboardingCompleted: true });
    },
    onComplete: async () => {
      await router.invalidate();
      await navigate({ to: "/admin" });
    }
  });

  const values = watch();
  const selectedOrganization = useMemo(
    () => organizations.data?.find(({ id }) => id === values.defaultAuthOrgId),
    [organizations.data, values.defaultAuthOrgId]
  );
  const onSubmit = handleSubmit(async (formData) => {
    try {
      if (activeStep === SetupStep.Access) {
        const enabledIdentityProviderMethods = (
          config.enabledLoginMethods ?? identityProviderLoginMethods
        ).filter((method) => identityProviderLoginMethods.includes(method));

        await updateServerConfig({
          allowSignUp: formData.signUpMode === SignUpMode.Anyone,
          allowedSignUpDomain:
            formData.signUpMode === SignUpMode.Anyone
              ? formData.allowedSignUpDomain.trim() || null
              : null,
          enabledLoginMethods: [
            ...formData.enabledLoginMethods,
            ...enabledIdentityProviderMethods
          ]
        });
        next();
        return;
      }

      if (activeStep === SetupStep.IdentityRouting) {
        await updateServerConfig({
          defaultAuthOrgId: formData.defaultAuthOrgId || null
        });
        next();
        return;
      }

      await complete();
    } catch {
      createNotification({
        type: "error",
        text: "The server settings could not be saved. Try again."
      });
    }
  });

  const renderStep = () => {
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
                        <FieldTitle className="font-alliance text-base">Allow Sign-ups</FieldTitle>
                        <FieldDescription>Optionally limit by source/domain</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={SignUpMode.Anyone} id="signup-anyone" />
                    </Field>
                  </FieldLabel>
                </RadioGroup>
              </Field>
            )}
          />
          <AnimatedCollapse
            isOpen={values.signUpMode === SignUpMode.Anyone}
            contentClassName="-m-2 p-2"
          >
            <div className="flex flex-col gap-4">
              <Controller
                control={control}
                name="enabledLoginMethods"
                render={({ field }) => (
                  <Field>
                    <div>
                      <h3 className="font-alliance text-base font-medium text-foreground">
                        Sign-in methods
                      </h3>
                      <p className="mt-1 text-xs text-muted">
                        Select the sign-in methods to make available
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {loginMethods.map((method) => {
                        const isChecked = field.value.includes(method.value);
                        const MethodIcon = method.icon;

                        return (
                          <FieldLabel
                            key={method.value}
                            htmlFor={`login-method-${method.value}`}
                            variant="project"
                            className="h-full"
                          >
                            <Field
                              orientation="horizontal"
                              className="h-full items-center gap-2"
                            >
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
                    <FieldError>{errors.enabledLoginMethods?.message}</FieldError>
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="allowedSignUpDomain"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="allowed-signup-domain" className="text-xs">
                      Signup domain restrictions (optional)
                    </FieldLabel>
                    <Input
                      {...field}
                      id="allowed-signup-domain"
                      placeholder="acme.com, example.com"
                    />
                    <FieldDescription>Leave blank to allow any email domain.</FieldDescription>
                  </Field>
                )}
              />

            </div>
          </AnimatedCollapse>
        </FieldGroup>
      );
    }

    if (activeStep === SetupStep.IdentityRouting) {
      return (
        <Controller
          key={SetupStep.IdentityRouting}
          control={control}
          name="defaultAuthOrgId"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="default-auth-organization">Default organization</FieldLabel>
              <Select
                value={field.value || "all"}
                onValueChange={(value) => field.onChange(value === "all" ? "" : value)}
              >
                <SelectTrigger id="default-auth-organization" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Allow users to select an organization</SelectItem>
                  {organizations.data?.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                This setting applies to SAML, LDAP, OIDC, and GitHub authentication.
              </FieldDescription>
            </Field>
          )}
        />
      );
    }

    const enabledMethodLabels = loginMethods
      .filter(({ value }) => values.enabledLoginMethods.includes(value))
      .map(({ label }) => label)
      .join(", ");
    let signUpSummary = "Anyone can sign up";
    if (values.signUpMode === SignUpMode.Disabled) {
      signUpSummary = "Invitation only";
    } else if (values.allowedSignUpDomain) {
      signUpSummary = `Signups limited to ${values.allowedSignUpDomain}`;
    }

    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-start gap-3 border-b border-border p-4">
          <Check className="mt-0.5 size-4 text-success" />
          <div>
            <p className="text-sm font-medium text-foreground">User access</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{signUpSummary}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 border-b border-border p-4">
          <Check className="mt-0.5 size-4 text-success" />
          <div>
            <p className="text-sm font-medium text-foreground">Login methods</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{enabledMethodLabels}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4">
          <Check className="mt-0.5 size-4 text-success" />
          <div>
            <p className="text-sm font-medium text-foreground">Identity routing</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {selectedOrganization
                ? `Route users to ${selectedOrganization.name}`
                : "Allow users to select an organization"}
            </p>
          </div>
        </div>
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
    >
      <Helmet>
        <title>Configure your instance | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <AuthPagePanel>
        <form onSubmit={onSubmit}>
          <CardHeader className="mb-8 gap-2">
            <CardTitle className="font-alliance text-3xl leading-tight font-normal">
              {stepContent[activeStep].title}
            </CardTitle>
            <CardDescription className="font-alliance text-base leading-relaxed">
              {stepContent[activeStep].description}
            </CardDescription>
          </CardHeader>

          <CardContent>{renderStep()}</CardContent>

          <CardFooter className="mt-8 justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => {
                if (activeStepIndex === 0) {
                  navigate({ to: "/admin/welcome" });
                  return;
                }
                back();
              }}
            >
              <ChevronLeft />
              Back
            </Button>
            <Button
              type="submit"
              variant="project"
              isPending={isSubmitting || isCompleting}
            >
              {activeStep === SetupStep.Review ? "Finish setup" : "Continue"}
            </Button>
          </CardFooter>
        </form>
      </AuthPagePanel>
    </OnboardingPageLayout>
  );
};
