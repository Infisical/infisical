import { useState } from "react";
import { Helmet } from "react-helmet";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useRouter } from "@tanstack/react-router";
import axios from "axios";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";

import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { OnboardingPageLayout } from "@app/components/auth/OnboardingPageLayout";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  Alert,
  AlertDescription,
  Button,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  Input
} from "@app/components/v3";
import { useCreateAdminUser, useSelectOrganization } from "@app/hooks/api";
import { GenericResourceNameSchema } from "@app/lib/schemas";

import { AdminSignUpForm } from "./components/AdminSignUpForm";
import { AdminSignUpFormData } from "./adminSignUpSchema";

enum BootstrapStep {
  Account,
  Organization
}

const organizationSchema = z.object({
  organizationName: GenericResourceNameSchema
});

type TOrganizationForm = z.infer<typeof organizationSchema>;

const stepContent = {
  [BootstrapStep.Account]: {
    title: "Create your Super Admin account",
    description: "Use this account to manage your Infisical instance."
  },
  [BootstrapStep.Organization]: {
    title: "Create your organization",
    description: "Set up the first workspace for your projects, secrets, and team."
  }
} satisfies Record<BootstrapStep, { title: string; description: string }>;

export const SignUpPage = () => {
  const navigate = useNavigate();
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(BootstrapStep.Account);
  const [accountData, setAccountData] = useState<AdminSignUpFormData>();
  const [formError, setFormError] = useState<string>();
  const { mutateAsync: createAdminUser, isPending } = useCreateAdminUser();
  const { mutateAsync: selectOrganization } = useSelectOrganization();
  const {
    formState: { errors },
    handleSubmit,
    register
  } = useForm<TOrganizationForm>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      organizationName: ""
    }
  });

  const handleAccountContinue = (values: AdminSignUpFormData) => {
    setAccountData(values);
    setFormError(undefined);
    setActiveStep(BootstrapStep.Organization);
  };

  const handleOrganizationSubmit = handleSubmit(async ({ organizationName }) => {
    if (!accountData) {
      setActiveStep(BootstrapStep.Account);
      return;
    }

    setFormError(undefined);

    try {
      const result = await createAdminUser({
        email: accountData.email,
        password: accountData.password,
        firstName: accountData.firstName,
        lastName: accountData.lastName || undefined,
        organizationName
      });

      SecurityClient.setToken(result.token);
      await selectOrganization({ organizationId: result.organization.id });
      localStorage.setItem("orgData.id", result.organization.id);
      await router.invalidate();
      await navigate({ to: "/admin/setup" });
    } catch (error) {
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;
      setFormError(message || "Unable to create the instance. Please try again.");
    }
  });

  return (
    <OnboardingPageLayout currentStep={activeStep + 1} totalSteps={4}>
      <Helmet>
        <title>Set up your instance | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <AuthPagePanel>
        <CardHeader className="mb-6 gap-2">
          <CardTitle className="font-alliance text-2xl font-normal">
            {stepContent[activeStep].title}
          </CardTitle>
          <CardDescription className="font-alliance text-base">
            {stepContent[activeStep].description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeStep === BootstrapStep.Account ? (
            <AdminSignUpForm defaultValues={accountData} onContinue={handleAccountContinue} />
          ) : (
            <form className="flex flex-col gap-6" noValidate onSubmit={handleOrganizationSubmit}>
              {formError && (
                <Alert variant="danger">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <Field data-invalid={Boolean(errors.organizationName)}>
                <Input
                  variant="outlined"
                  {...register("organizationName")}
                  id="admin-signup-organization"
                  aria-label="Organization name"
                  placeholder="Organization name"
                  autoComplete="organization"
                  autoFocus
                  isError={Boolean(errors.organizationName)}
                />
                {errors.organizationName ? (
                  <FieldError>{errors.organizationName.message}</FieldError>
                ) : null}
              </Field>
              <div className="flex justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveStep(BootstrapStep.Account)}
                >
                  <ChevronLeft />
                  Back
                </Button>
                <Button type="submit" variant="project" isPending={isPending}>
                  Create organization
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </AuthPagePanel>
    </OnboardingPageLayout>
  );
};
