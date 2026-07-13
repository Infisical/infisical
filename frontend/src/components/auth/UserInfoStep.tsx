import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { PasswordField } from "@app/components/auth/PasswordField";
import {
  checkPasswordBreachStatus,
  PasswordBreachStatus
} from "@app/components/utilities/checks/password/checkIsPasswordBreached";
import { passwordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";
import { EXAMPLE_PROJECT_NAME } from "@app/const";
import { isInfisicalCloud } from "@app/helpers/platform";
import { initProjectHelper } from "@app/helpers/project";
import { getHubSpotUtk } from "@app/helpers/utmTracking";
import { useCompleteAccountSignup } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";

import SecurityClient from "../utilities/SecurityClient";

const createUserInfoFormSchema = (isInvite: boolean) =>
  z.object({
    name: z.string().min(1, "Please, specify your name"),
    organizationName: isInvite
      ? z.string().optional()
      : z.string().min(1, "Please, specify your organization name").max(64),
    password: passwordSchema,
    attributionSource: z.string().optional()
  });

type UserInfoFormData = z.infer<ReturnType<typeof createUserInfoFormSchema>>;

interface UserInfoStepProps {
  onComplete: () => void;
  email: string;
  isInvite?: boolean;
}

export default function UserInfoStep({
  onComplete,
  email,
  isInvite = false
}: UserInfoStepProps): JSX.Element {
  const [passwordBreachStatus, setPasswordBreachStatus] = useState<
    PasswordBreachStatus | "idle" | "checking"
  >("idle");

  const { mutateAsync: completeSignup, isPending: isLoading } = useCompleteAccountSignup();
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isValid, submitCount }
  } = useForm<UserInfoFormData>({
    resolver: zodResolver(createUserInfoFormSchema(isInvite)),
    mode: "onChange",
    defaultValues: {
      name: "",
      organizationName: "",
      password: "",
      attributionSource: ""
    }
  });

  const passwordValue = watch("password");
  const showDangerState = submitCount > 0;
  const isPasswordValidated =
    passwordBreachStatus === "safe" || passwordBreachStatus === "unavailable";
  const canSubmit = isValid && isPasswordValidated && !isLoading;

  const onSubmit = async (formData: UserInfoFormData) => {
    const latestBreachStatus = await checkPasswordBreachStatus(formData.password);
    if (latestBreachStatus === "breached") {
      setError("password", {
        type: "validate",
        message: "This password was found in a known data breach."
      });
      return;
    }

    const response = await completeSignup({
      type: "email",
      email,
      password: formData.password,
      firstName: formData.name.split(" ")[0],
      lastName: formData.name.split(" ").slice(1).join(" "),
      organizationName: formData.organizationName || undefined,
      attributionSource: formData.attributionSource,
      hubspotUtk: getHubSpotUtk()
    });

    SecurityClient.setSignupToken("");
    SecurityClient.setToken(response.token);

    if (isInfisicalCloud()) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "signup_completed" });
    }

    const userOrgs = await fetchOrganizations();
    const orgId = userOrgs[0]?.id;

    if (!isInvite) {
      await initProjectHelper({
        projectName: EXAMPLE_PROJECT_NAME
      });
    }

    if (orgId) {
      localStorage.setItem("orgData.id", orgId);
    }

    onComplete();
  };

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <Card className="mx-auto w-full max-w-sm items-stretch gap-0 p-6">
        <CardHeader className="mb-4 gap-2">
          <CardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text font-alliance text-2xl font-normal text-transparent">
            {isInvite ? "Set up your account" : t("signup.step3-message")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Field className="py-2" data-invalid={showDangerState && Boolean(errors.name)}>
            <FieldLabel htmlFor="signup-name">Your Name</FieldLabel>
            <Input
              {...register("name")}
              id="signup-name"
              placeholder="Jane Doe"
              autoComplete="name"
              isError={showDangerState && Boolean(errors.name)}
            />
          </Field>
          {!isInvite && (
            <>
              <Field
                className="py-2"
                data-invalid={showDangerState && Boolean(errors.organizationName)}
              >
                <FieldLabel htmlFor="signup-organization-name">Organization Name</FieldLabel>
                <Input
                  {...register("organizationName")}
                  id="signup-organization-name"
                  placeholder="Acme Inc."
                  maxLength={64}
                  autoComplete="organization"
                  isError={showDangerState && Boolean(errors.organizationName)}
                />
              </Field>
              <Field className="py-2">
                <FieldLabel htmlFor="signup-attribution-source">
                  Where did you hear about us? <span className="font-light">(optional)</span>
                </FieldLabel>
                <TextArea
                  {...register("attributionSource")}
                  id="signup-attribution-source"
                  placeholder="A colleague, search engine, conference…"
                  rows={2}
                />
              </Field>
            </>
          )}
          <div className="py-2">
            <PasswordField
              id="new-password"
              value={passwordValue}
              placeholder="••••••••"
              registration={register("password")}
              error={showDangerState ? errors.password : undefined}
              submitCount={submitCount}
              onBreachStatusChange={setPasswordBreachStatus}
            />
          </div>
          <div className="mt-4 w-full">
            <Button
              type="submit"
              onClick={handleSubmit(onSubmit)}
              variant="project"
              size="lg"
              isFullWidth
              isPending={isLoading}
              isDisabled={!canSubmit}
            >
              {String(t("signup.signup"))}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
