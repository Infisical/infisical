import { useState } from "react";
import { useTranslation } from "react-i18next";
import { faGithub, faGitlab, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { z } from "zod";

import { RegionSelect } from "@app/components/navigation/RegionSelect";
import {
  Button,
  ButtonBadge,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldSeparator,
  Input
} from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { preserveHubSpotUtk } from "@app/helpers/utmTracking";
import { useSendVerificationEmail } from "@app/hooks/api";
import { LoginMethod } from "@app/hooks/api/admin/types";

import { AuthPagePanel } from "./AuthPagePanel";

interface InitialSignupStepProps {
  email: string;
  setEmail: (value: string) => void;
  incrementStep: (email: string, cooldownSeconds: number) => void;
  pendingVerificationEmail?: string;
  onResumeVerification: () => void;
}

export default function InitialSignupStep({
  email,
  setEmail,
  incrementStep,
  pendingVerificationEmail,
  onResumeVerification
}: InitialSignupStepProps) {
  const { t } = useTranslation();
  const { config } = useServerConfig();
  const { mutateAsync, isPending } = useSendVerificationEmail();
  const [emailError, setEmailError] = useState(false);
  const isEmailValid = z.string().email().safeParse(email).success;

  const shouldDisplaySignupMethod = (method: LoginMethod) =>
    !config.enabledLoginMethods || config.enabledLoginMethods.includes(method);

  const hasSsoSignupMethod =
    shouldDisplaySignupMethod(LoginMethod.GITHUB) ||
    shouldDisplaySignupMethod(LoginMethod.GOOGLE) ||
    shouldDisplaySignupMethod(LoginMethod.GITLAB);

  const handleEmailSignup = async () => {
    const isValid = z.string().email().safeParse(email);

    if (!isValid.success) {
      setEmailError(true);
      return;
    }

    setEmailError(false);
    const normalizedEmail = email.toLowerCase();

    if (normalizedEmail === pendingVerificationEmail) {
      setEmail(normalizedEmail);
      onResumeVerification();
      return;
    }

    const { cooldownSeconds } = await mutateAsync({ email: normalizedEmail });
    incrementStep(normalizedEmail, cooldownSeconds);
  };

  const handleSocialSignup = (method: LoginMethod) => {
    preserveHubSpotUtk();
    const popup = window.open(`/api/v1/sso/redirect/${method}`);
    if (popup) {
      window.close();
    }
  };

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <AuthPagePanel>
        <CardHeader className="mb-6 gap-2">
          <CardTitle className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text font-alliance text-2xl font-normal text-transparent">
            Sign up
          </CardTitle>
          <CardDescription className="ml-0.5 text-base">
            Create your Infisical account
          </CardDescription>
          <CardAction>
            <RegionSelect compact />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex w-full flex-col gap-2">
            {shouldDisplaySignupMethod(LoginMethod.GITHUB) && (
              <Button
                aria-label="Continue with GitHub"
                variant="outline"
                size="lg"
                isFullWidth
                onClick={() => handleSocialSignup(LoginMethod.GITHUB)}
              >
                <FontAwesomeIcon icon={faGithub} />
                Continue with GitHub
                <ButtonBadge variant="project">Recommended</ButtonBadge>
              </Button>
            )}
            {shouldDisplaySignupMethod(LoginMethod.GOOGLE) && (
              <Button
                aria-label={t("signup.continue-with-google")}
                variant="outline"
                size="lg"
                isFullWidth
                onClick={() => handleSocialSignup(LoginMethod.GOOGLE)}
              >
                <FontAwesomeIcon icon={faGoogle} />
                {t("signup.continue-with-google")}
              </Button>
            )}
            {shouldDisplaySignupMethod(LoginMethod.GITLAB) && (
              <Button
                aria-label="Continue with GitLab"
                variant="outline"
                size="lg"
                isFullWidth
                onClick={() => handleSocialSignup(LoginMethod.GITLAB)}
              >
                <FontAwesomeIcon icon={faGitlab} />
                Continue with GitLab
              </Button>
            )}
          </div>
          {hasSsoSignupMethod && shouldDisplaySignupMethod(LoginMethod.EMAIL) && (
            <FieldSeparator>or</FieldSeparator>
          )}
          {shouldDisplaySignupMethod(LoginMethod.EMAIL) && (
            <div className="flex w-full flex-col gap-4">
              <Input
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(false);
                }}
                type="email"
                placeholder="you@company.com"
                required
                autoComplete="username"
                className="h-10"
                isError={emailError}
              />
              <Button
                type="submit"
                onClick={handleEmailSignup}
                variant="project"
                size="lg"
                isFullWidth
                isDisabled={!isEmailValid || isPending}
                isPending={isPending}
              >
                Continue with Email
              </Button>
            </div>
          )}
        </CardContent>
      </AuthPagePanel>
      <div className="mt-3 flex items-center justify-center gap-1.5 text-sm">
        <span className="text-label">Already have an account?</span>
        <Link
          to="/login"
          className="text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project"
        >
          Log in
        </Link>
      </div>
    </div>
  );
}
