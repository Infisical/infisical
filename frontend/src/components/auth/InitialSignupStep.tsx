import { useTranslation } from "react-i18next";
import { faGithub, faGitlab, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { CircleChevronRightIcon, Mail } from "lucide-react";

import { RegionSelect } from "@app/components/navigation/RegionSelect";
import {
  Button,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { LoginMethod } from "@app/hooks/api/admin/types";

export default function InitialSignupStep({
  setIsSignupWithEmail
}: {
  setIsSignupWithEmail: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const { config } = useServerConfig();

  const shouldDisplaySignupMethod = (method: LoginMethod) =>
    !config.enabledLoginMethods || config.enabledLoginMethods.includes(method);

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
            <div className="mt-2 w-full">
              <Button
                variant="project"
                size="lg"
                isFullWidth
                onClick={() => setIsSignupWithEmail(true)}
              >
                <Mail className="mr-2 size-4" />
                Continue with Email
              </Button>
            </div>
          )}
          {shouldDisplaySignupMethod(LoginMethod.GOOGLE) && (
            <div className="mt-2 w-full">
              <Button
                variant="outline"
                size="lg"
                isFullWidth
                onClick={() => {
                  window.open("/api/v1/sso/redirect/google");
                  window.close();
                }}
              >
                <FontAwesomeIcon icon={faGoogle} className="mr-2" />
                {t("signup.continue-with-google")}
              </Button>
            </div>
          )}
          {shouldDisplaySignupMethod(LoginMethod.GITHUB) && (
            <div className="mt-2 w-full">
              <Button
                variant="outline"
                size="lg"
                isFullWidth
                onClick={() => {
                  window.open("/api/v1/sso/redirect/github");
                  window.close();
                }}
              >
                <FontAwesomeIcon icon={faGithub} className="mr-2" />
                Continue with GitHub
              </Button>
            </div>
          )}
          {shouldDisplaySignupMethod(LoginMethod.GITLAB) && (
            <div className="mt-2 w-full">
              <Button
                variant="outline"
                size="lg"
                isFullWidth
                onClick={() => {
                  window.open("/api/v1/sso/redirect/gitlab");
                  window.close();
                }}
              >
                <FontAwesomeIcon icon={faGitlab} className="mr-2" />
                Continue with GitLab
              </Button>
            </div>
          )}
          <div className="mt-6 flex flex-row justify-center text-xs text-muted">
            <Link to="/login">
              <span className="cursor-pointer duration-200 hover:text-label hover:underline hover:decoration-project/45 hover:underline-offset-2">
                Already have an account? Log in
              </span>
            </Link>
          </div>
          <p className="mt-4 text-center text-xs text-muted">
            By signing up, you agree to our{" "}
            <a
              href="https://infisical.com/terms/cloud"
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer underline underline-offset-2 duration-200 hover:text-label hover:decoration-project/45"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="https://infisical.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer underline underline-offset-2 duration-200 hover:text-label hover:decoration-project/45"
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
