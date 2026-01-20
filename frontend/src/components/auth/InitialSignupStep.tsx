import { useTranslation } from "react-i18next";
import { faGithub, faGitlab, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { faEnvelope } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate } from "@tanstack/react-router";

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
  const navigate = useNavigate();
  const shouldDisplaySignupMethod = (method: LoginMethod) =>
    !config.enabledLoginMethods || config.enabledLoginMethods.includes(method);

  const handleOauth = (provider: string) => {
    navigate({
      href: `/api/v1/sso/redirect/${provider}`,
      reloadDocument: true
    });
  };

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <h1 className="mb-8 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
        {t("signup.initial-title")}
      </h1>
      <RegionSelect />
      {shouldDisplaySignupMethod(LoginMethod.GOOGLE) && (
        <div className="w-1/4 min-w-[20rem] rounded-md lg:w-1/6">
          <Button
            colorSchema="primary"
            variant="solid"
            onClick={() => handleOauth("google")}
            leftIcon={<FontAwesomeIcon icon={faGoogle} className="mr-2" />}
            className="mx-0 h-12 w-full"
          >
            {t("signup.continue-with-google")}
          </Button>
        </div>
      )}
      {shouldDisplaySignupMethod(LoginMethod.GITHUB) && (
        <div className="mt-4 w-1/4 min-w-[20rem] rounded-md lg:w-1/6">
          <Button
            colorSchema="primary"
            variant="outline_bg"
            onClick={() => handleOauth("github")}
            leftIcon={<FontAwesomeIcon icon={faGithub} className="mr-2" />}
            className="mx-0 h-12 w-full"
          >
            Continue with GitHub
          </Button>
        </div>
      )}
      {shouldDisplaySignupMethod(LoginMethod.GITLAB) && (
        <div className="mt-4 w-1/4 min-w-[20rem] rounded-md lg:w-1/6">
          <Button
            colorSchema="primary"
            variant="outline_bg"
            onClick={() => handleOauth("gitlab")}
            leftIcon={<FontAwesomeIcon icon={faGitlab} className="mr-2" />}
            className="mx-0 h-12 w-full"
          >
            Continue with GitLab
          </Button>
        </div>
      )}
      {shouldDisplaySignupMethod(LoginMethod.EMAIL) && (
        <div className="mt-4 w-1/4 min-w-[20rem] rounded-md text-center lg:w-1/6">
          <Button
            colorSchema="primary"
            variant="outline_bg"
            onClick={() => {
              setIsSignupWithEmail(true);
            }}
            leftIcon={<FontAwesomeIcon icon={faEnvelope} className="mr-2" />}
            className="mx-0 h-12 w-full"
          >
            Continue with Email
          </Button>
        </div>
      )}
      <div className="mt-6 w-1/4 min-w-[20rem] px-8 text-center text-xs text-bunker-400 lg:w-1/6">
        {t("signup.create-policy")}
      </div>
      <div className="mt-2 flex flex-row text-xs text-bunker-400">
        <Link to="/login">
          <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
            {t("signup.already-have-account")}
          </span>
        </Link>
      </div>
    </div>
  );
}
