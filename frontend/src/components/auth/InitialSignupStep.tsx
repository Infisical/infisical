import { useState } from "react";
import { useTranslation } from "react-i18next";
import { faGithub, faGitlab, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { CircleChevronRightIcon } from "lucide-react";
import { z } from "zod";

import { RegionSelect } from "@app/components/navigation/RegionSelect";
import {
  Button,
  FieldError,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableInput
} from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { useSendVerificationEmail } from "@app/hooks/api";
import { LoginMethod } from "@app/hooks/api/admin/types";

interface InitialSignupStepProps {
  email: string;
  setEmail: (value: string) => void;

  incrementStep: () => void;
}

export default function InitialSignupStep({
  email,
  setEmail,
  incrementStep
}: InitialSignupStepProps) {
  const { t } = useTranslation();
  const { config } = useServerConfig();
  const { mutateAsync, isPending } = useSendVerificationEmail();
  const [emailError, setEmailError] = useState(false);

  const shouldDisplaySignupMethod = (method: LoginMethod) =>
    !config.enabledLoginMethods || config.enabledLoginMethods.includes(method);

  const handleEmailSignup = async () => {
    const isValid = z.string().email().safeParse(email);

    if (!isValid.success) {
      setEmailError(true);
      return;
    }

    setEmailError(false);
    await mutateAsync({ email: email.toLowerCase() });
    setEmail(email.toLowerCase());
    incrementStep();
  };

  const handleSocialSignup = (method: LoginMethod) => {
    const popup = window.open(`/api/v1/sso/redirect/${method}`);
    if (popup) {
      window.close();
    }
  };

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <UnstableCard className="mx-auto w-full max-w-sm items-stretch gap-0 p-6">
        <UnstableCardHeader className="mb-4 gap-4">
          <UnstableCardTitle className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.65rem] font-medium text-transparent">
            {t("signup.initial-title")}
          </UnstableCardTitle>
          <UnstableCardAction className="-mr-2">
            <RegionSelect compact />
          </UnstableCardAction>
        </UnstableCardHeader>
        <UnstableCardContent>
          {shouldDisplaySignupMethod(LoginMethod.EMAIL) && (
            <>
              <div className="w-full">
                <UnstableInput
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="Enter your email..."
                  required
                  autoComplete="username"
                  className="h-10"
                  isError={emailError}
                />
                {emailError && <FieldError>Please enter a valid email.</FieldError>}
              </div>
              <div className="mt-4 w-full">
                <Button
                  type="submit"
                  onClick={handleEmailSignup}
                  variant="project"
                  size="lg"
                  isFullWidth
                  isDisabled={isPending}
                  isPending={isPending}
                >
                  Continue with Email
                </Button>
              </div>
            </>
          )}
          {(!config.enabledLoginMethods ||
            (shouldDisplaySignupMethod(LoginMethod.EMAIL) &&
              config.enabledLoginMethods.length > 1)) && (
            <div className="my-4 flex w-full flex-row items-center py-2">
              <div className="w-full border-t border-mineshaft-400/60" />
              <span className="mx-2 text-xs text-mineshaft-400">or</span>
              <div className="w-full border-t border-mineshaft-400/60" />
            </div>
          )}
          <div className="flex w-full gap-2">
            {shouldDisplaySignupMethod(LoginMethod.GOOGLE) && (
              <Tooltip disableHoverableContent>
                <TooltipTrigger asChild>
                  <div className="relative w-full">
                    <Button
                      aria-label={t("signup.continue-with-google")}
                      variant="outline"
                      size="lg"
                      isFullWidth
                      onClick={() => handleSocialSignup(LoginMethod.GOOGLE)}
                    >
                      <FontAwesomeIcon icon={faGoogle} className="!size-4" />
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">{t("signup.continue-with-google")}</TooltipContent>
              </Tooltip>
            )}
            {shouldDisplaySignupMethod(LoginMethod.GITHUB) && (
              <Tooltip disableHoverableContent>
                <TooltipTrigger asChild>
                  <div className="relative w-full">
                    <Button
                      aria-label="Continue with GitHub"
                      variant="outline"
                      size="lg"
                      isFullWidth
                      onClick={() => handleSocialSignup(LoginMethod.GITHUB)}
                    >
                      <FontAwesomeIcon icon={faGithub} className="!size-4" />
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">Continue with GitHub</TooltipContent>
              </Tooltip>
            )}
            {shouldDisplaySignupMethod(LoginMethod.GITLAB) && (
              <Tooltip disableHoverableContent>
                <TooltipTrigger asChild>
                  <div className="relative w-full">
                    <Button
                      aria-label="Continue with GitLab"
                      variant="outline"
                      size="lg"
                      isFullWidth
                      onClick={() => handleSocialSignup(LoginMethod.GITLAB)}
                    >
                      <FontAwesomeIcon icon={faGitlab} className="!size-4" />
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">Continue with GitLab</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="mt-6 flex flex-row justify-center text-xs text-label">
            <Link to="/login">
              <span className="cursor-pointer duration-200 hover:text-foreground hover:underline hover:decoration-project/45 hover:underline-offset-2">
                Already have an account? Log in
              </span>
            </Link>
          </div>
          <p className="mt-4 text-center text-xs text-pretty text-label">
            By signing up, you agree to our{" "}
            <a
              href="https://infisical.com/terms/cloud"
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer underline underline-offset-2 duration-200 hover:text-foreground hover:decoration-project/45"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="https://infisical.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer underline underline-offset-2 duration-200 hover:text-foreground hover:decoration-project/45"
            >
              Privacy Policy
            </a>
            .
          </p>
          <a
            href="https://infisical.com/talk-to-us?utm_source=signup&utm_medium=referral"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-project/35 bg-project/5 px-4 py-3 transition-colors hover:border-project/40 hover:bg-project/10"
          >
            <span className="min-w-0 flex-1 text-xs text-foreground/75">
              Have a complex company use case?{" "}
              <span className="font-medium">
                Get <span className="text-white/90">Enterprise grade</span> assistance
              </span>
            </span>
            <CircleChevronRightIcon className="size-4.5 opacity-75" />
          </a>
        </UnstableCardContent>
      </UnstableCard>
    </div>
  );
}
