import { useTranslation } from "react-i18next";
import { faGithub, faGitlab, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { faEnvelope } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import { RegionSelect } from "@app/components/navigation/RegionSelect";
import { useServerConfig } from "@app/context";
import { LoginMethod } from "@app/hooks/api/admin/types";

import { Button } from "../v2";

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
      <motion.div
        layoutId="signup-card"
        className="mx-auto flex w-full max-w-sm flex-col items-stretch rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-6"
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        <div className="mb-4 flex w-full items-center gap-4">
          <h1 className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.65rem] font-medium text-transparent">
            {t("signup.initial-title")}
          </h1>
          <div className="-mr-2 ml-auto">
            <RegionSelect compact />
          </div>
        </div>
        {shouldDisplaySignupMethod(LoginMethod.GOOGLE) && (
          <div className="mt-2 w-full">
            <Button
              colorSchema="primary"
              variant="solid"
              onClick={() => {
                window.open("/api/v1/sso/redirect/google");
                window.close();
              }}
              leftIcon={<FontAwesomeIcon icon={faGoogle} className="mr-2" />}
              className="mx-0 h-10 w-full"
            >
              {t("signup.continue-with-google")}
            </Button>
          </div>
        )}
        {shouldDisplaySignupMethod(LoginMethod.GITHUB) && (
          <div className="mt-2 w-full">
            <Button
              colorSchema="primary"
              variant="outline_bg"
              onClick={() => {
                window.open("/api/v1/sso/redirect/github");
                window.close();
              }}
              leftIcon={<FontAwesomeIcon icon={faGithub} className="mr-2" />}
              className="mx-0 h-10 w-full"
            >
              Continue with GitHub
            </Button>
          </div>
        )}
        {shouldDisplaySignupMethod(LoginMethod.GITLAB) && (
          <div className="mt-2 w-full">
            <Button
              colorSchema="primary"
              variant="outline_bg"
              onClick={() => {
                window.open("/api/v1/sso/redirect/gitlab");
                window.close();
              }}
              leftIcon={<FontAwesomeIcon icon={faGitlab} className="mr-2" />}
              className="mx-0 h-10 w-full"
            >
              Continue with GitLab
            </Button>
          </div>
        )}
        {shouldDisplaySignupMethod(LoginMethod.EMAIL) && (
          <div className="mt-2 w-full">
            <Button
              colorSchema="primary"
              variant="outline_bg"
              onClick={() => {
                setIsSignupWithEmail(true);
              }}
              leftIcon={<FontAwesomeIcon icon={faEnvelope} className="mr-2" />}
              className="mx-0 h-10 w-full"
            >
              Continue with Email
            </Button>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-bunker-400">
          By signing up, you agree to our{" "}
          <a
            href="https://infisical.com/terms/cloud"
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer underline duration-200 hover:text-bunker-200 hover:decoration-primary-700"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="https://infisical.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer underline duration-200 hover:text-bunker-200 hover:decoration-primary-700"
          >
            Privacy Policy
          </a>
          .
        </p>
        <a
          href="https://infisical.com/talk-to-us?utm_source=signup&utm_medium=referral"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 transition-colors hover:border-primary/60 hover:bg-primary/10"
        >
          <span className="min-w-0 flex-1 text-xs text-white/50">
            Have a complex company use case?{" "}
            <span className="font-medium">
              Get <span className="text-white/90">Enterprise grade</span> assistance
            </span>
          </span>
          <svg
            className="h-4 w-4 shrink-0 text-white/80"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M10 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </motion.div>
    </div>
  );
}
