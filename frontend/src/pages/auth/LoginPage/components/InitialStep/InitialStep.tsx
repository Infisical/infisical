import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { faGithub, faGitlab, faGoogle } from "@fortawesome/free-brands-svg-icons";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { z } from "zod";

import Error from "@app/components/basic/Error";
import { RegionSelect } from "@app/components/navigation/RegionSelect";
import { createNotification } from "@app/components/notifications";
import attemptLogin from "@app/components/utilities/attemptLogin";
import {
  Badge,
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";
import { envConfig } from "@app/config/env";
import { useServerConfig } from "@app/context";
import { useFetchServerStatus } from "@app/hooks/api";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { AuthMethod } from "@app/hooks/api/users/types";
import { useLastLogin } from "@app/hooks/useLastLogin";

import { LoginSection, useNavigateToSelectOrganization } from "../../Login.utils";
import { OrgLoginButton } from "../OrgLoginButton";
import { SocialLoginButton } from "../SocialLoginButton";

const loginFormSchema = z.object({
  email: z.string().email("Please enter a valid email").min(1, "Email is required"),
  password: z.string().min(1, "Password is required")
});

type LoginFormData = z.infer<typeof loginFormSchema>;

type Props = {
  setSection: (section: LoginSection) => void;
  isAdmin?: boolean;
};

export const InitialStep = ({ setSection, isAdmin }: Props) => {
  const navigate = useNavigate();

  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const { config } = useServerConfig();
  const queryParams = new URLSearchParams(window.location.search);
  const [captchaToken, setCaptchaToken] = useState("");
  const [shouldShowCaptcha, setShouldShowCaptcha] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const captchaRef = useRef<HCaptcha>(null);
  const { data: serverDetails } = useFetchServerStatus();

  const { navigateToSelectOrganization } = useNavigateToSelectOrganization();
  const { lastLogin, saveLastLogin } = useLastLogin();

  const callbackPort = queryParams.get("callback_port");

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  const redirectToSaml = (orgSlug: string) => {
    const redirectUrl = `/api/v1/sso/redirect/saml2/organizations/${orgSlug}${
      callbackPort ? `?callback_port=${callbackPort}` : ""
    }`;
    window.location.assign(redirectUrl);
  };

  const redirectToOidc = (orgSlug: string) => {
    const redirectUrl = `/api/v1/sso/oidc/login?domain=${orgSlug}${
      callbackPort ? `&callbackPort=${callbackPort}` : ""
    }`;
    window.location.assign(redirectUrl);
  };

  useEffect(() => {
    if (serverDetails?.samlDefaultOrgSlug && !isAdmin) {
      saveLastLogin({ method: LoginMethod.SAML, orgSlug: serverDetails.samlDefaultOrgSlug });
      redirectToSaml(serverDetails.samlDefaultOrgSlug);
    }
  }, [serverDetails?.samlDefaultOrgSlug]);

  const handleSaml = () => {
    if (config.defaultAuthOrgSlug) {
      saveLastLogin({ method: LoginMethod.SAML, orgSlug: config.defaultAuthOrgSlug });
      redirectToSaml(config.defaultAuthOrgSlug);
    } else {
      setSection(LoginSection.SAML);
    }
  };

  const handleOidc = () => {
    if (config.defaultAuthOrgSlug) {
      saveLastLogin({ method: LoginMethod.OIDC, orgSlug: config.defaultAuthOrgSlug });
      redirectToOidc(config.defaultAuthOrgSlug);
    } else {
      setSection(LoginSection.OIDC);
    }
  };

  const handleSocialLogin = (method: LoginMethod) => {
    const searchParams = new URLSearchParams();
    if (callbackPort) {
      searchParams.append("callback_port", callbackPort);
    }
    if (isAdmin) {
      searchParams.append("is_admin_login", "true");
    }
    const qs = searchParams.toString();
    saveLastLogin({ method });
    window.location.replace(`/api/v1/sso/redirect/${method}${qs ? `?${qs}` : ""}`);
  };

  const isLastUsedMethod = (method: LoginMethod) => lastLogin?.method === method;

  const shouldDisplayLoginMethod = (method: LoginMethod) =>
    isAdmin || !config.enabledLoginMethods || config.enabledLoginMethods.includes(method);

  const handleLoginFailure = () => {
    setLoginError(true);
    const errorMessage = callbackPort
      ? "CLI login unsuccessful. Double-check your credentials and try again."
      : "Login unsuccessful. Double-check your credentials and try again.";

    createNotification({
      text: errorMessage,
      type: "error"
    });
  };

  const handleLoginError = (err: any) => {
    const errorType = err.response?.data?.error;
    if (errorType === "User Locked") {
      createNotification({
        title: err.response.data.error,
        text: err.response.data.message,
        type: "error"
      });
      return;
    }

    if (errorType === "Captcha Required") {
      setShouldShowCaptcha(true);
      return;
    }

    handleLoginFailure();
  };

  const resetCaptcha = () => {
    captchaRef.current?.resetCaptcha();
    setCaptchaToken("");
  };

  const handleEmailLogin = async (formData: LoginFormData) => {
    setIsLoading(true);

    try {
      const loginResult = await attemptLogin({
        email: formData.email.toLowerCase(),
        password: formData.password,
        captchaToken
      });

      const isLoginSuccessful = loginResult?.success;

      if (isLoginSuccessful) {
        saveLastLogin({ method: LoginMethod.EMAIL });
        navigateToSelectOrganization(callbackPort || undefined, isAdmin);
        createNotification({
          text: "Successfully logged in",
          type: "success"
        });
      } else {
        handleLoginFailure();
      }
    } catch (err: any) {
      console.error(err);
      handleLoginError(err);
    } finally {
      resetCaptcha();
      setIsLoading(false);
    }
  };

  if (config.defaultAuthOrgAuthEnforced && config.defaultAuthOrgAuthMethod && !isAdmin) {
    return (
      <form
        onSubmit={handleSubmit(handleEmailLogin)}
        className="mx-auto flex w-full flex-col items-center justify-center"
      >
        <UnstableCard className="mx-auto w-full max-w-sm items-stretch gap-0 p-6">
          <UnstableCardHeader className="mb-8 gap-2">
            <UnstableCardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.7rem] font-medium text-transparent">
              Log in to Infisical
            </UnstableCardTitle>
            <UnstableCardAction className="-mr-2">
              <RegionSelect compact />
            </UnstableCardAction>
          </UnstableCardHeader>
          <UnstableCardContent>
            {config.defaultAuthOrgAuthMethod === AuthMethod.SAML && (
              <OrgLoginButton label="Continue with SAML" onClick={handleSaml} />
            )}
            {config.defaultAuthOrgAuthMethod === AuthMethod.OIDC && (
              <OrgLoginButton label="Continue with OIDC" onClick={handleOidc} className="mt-2" />
            )}
          </UnstableCardContent>
        </UnstableCard>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(handleEmailLogin)}
      className="mx-auto flex w-full flex-col items-center justify-center"
    >
      <UnstableCard className="mx-auto w-full max-w-sm items-stretch gap-0 p-6">
        <UnstableCardHeader className="mb-4 gap-4">
          <UnstableCardTitle className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.65rem] font-medium text-transparent">
            Log in to Infisical
          </UnstableCardTitle>
          <UnstableCardAction className="-mr-2">
            <RegionSelect compact />
          </UnstableCardAction>
        </UnstableCardHeader>
        <UnstableCardContent>
          {shouldDisplayLoginMethod(LoginMethod.EMAIL) && (
            <>
              <div className="w-full">
                <UnstableInput
                  {...register("email")}
                  type="email"
                  placeholder="Enter your email..."
                  autoComplete="username"
                  className="h-10"
                />
                {errors.email && (
                  <span className="mt-1 text-xs text-red-500">{errors.email.message}</span>
                )}
              </div>
              <div className="mt-2 w-full">
                <InputGroup className="h-10">
                  <InputGroupInput
                    {...register("password")}
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password..."
                    autoComplete="current-password"
                    id="current-password"
                  />
                  <InputGroupAddon align="inline-end">
                    <UnstableIconButton
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </UnstableIconButton>
                  </InputGroupAddon>
                </InputGroup>
                {errors.password && (
                  <span className="mt-1 text-xs text-red-500">{errors.password.message}</span>
                )}
              </div>
              {shouldShowCaptcha && envConfig.CAPTCHA_SITE_KEY && (
                <div className="mt-4 flex justify-center [&>div]:!w-full">
                  <HCaptcha
                    theme="dark"
                    sitekey={envConfig.CAPTCHA_SITE_KEY}
                    onVerify={(token) => setCaptchaToken(token)}
                    ref={captchaRef}
                  />
                </div>
              )}
              <div className="relative mt-4 w-full">
                <Button
                  type="submit"
                  variant="project"
                  size="lg"
                  isFullWidth
                  isDisabled={(shouldShowCaptcha && captchaToken === "") || isLoading}
                  isPending={isLoading}
                >
                  Continue with Email
                </Button>
                {isLastUsedMethod(LoginMethod.EMAIL) && (
                  <Badge variant="default" className="absolute -top-2 -right-2">
                    Last used
                  </Badge>
                )}
              </div>
            </>
          )}
          {(!config.enabledLoginMethods ||
            (shouldDisplayLoginMethod(LoginMethod.EMAIL) &&
              config.enabledLoginMethods.length > 1)) && (
            <div className="my-4 flex w-full flex-row items-center py-2">
              <div className="w-full border-t border-mineshaft-400/60" />
              <span className="mx-2 text-xs text-mineshaft-400">or</span>
              <div className="w-full border-t border-mineshaft-400/60" />
            </div>
          )}
          <div className="flex w-full gap-2">
            {shouldDisplayLoginMethod(LoginMethod.GOOGLE) && (
              <SocialLoginButton
                icon={faGoogle}
                label={t("login.continue-with-google")}
                onClick={() => handleSocialLogin(LoginMethod.GOOGLE)}
                showLastUsed={isLastUsedMethod(LoginMethod.GOOGLE)}
              />
            )}
            {shouldDisplayLoginMethod(LoginMethod.GITHUB) && (
              <SocialLoginButton
                icon={faGithub}
                label="Continue with GitHub"
                onClick={() => handleSocialLogin(LoginMethod.GITHUB)}
                showLastUsed={isLastUsedMethod(LoginMethod.GITHUB)}
              />
            )}
            {shouldDisplayLoginMethod(LoginMethod.GITLAB) && (
              <SocialLoginButton
                icon={faGitlab}
                label="Continue with GitLab"
                onClick={() => handleSocialLogin(LoginMethod.GITLAB)}
                showLastUsed={isLastUsedMethod(LoginMethod.GITLAB)}
              />
            )}
          </div>
          {shouldDisplayLoginMethod(LoginMethod.SAML) && (
            <OrgLoginButton
              label="Continue with SAML"
              onClick={handleSaml}
              className="mt-2"
              showLastUsed={isLastUsedMethod(LoginMethod.SAML)}
            />
          )}
          {shouldDisplayLoginMethod(LoginMethod.OIDC) && (
            <OrgLoginButton
              label="Continue with OIDC"
              onClick={handleOidc}
              className="mt-2"
              showLastUsed={isLastUsedMethod(LoginMethod.OIDC)}
            />
          )}
          {shouldDisplayLoginMethod(LoginMethod.LDAP) && (
            <OrgLoginButton
              label="Continue with LDAP"
              onClick={() => navigate({ to: "/login/ldap" })}
              className="mt-2"
              showLastUsed={isLastUsedMethod(LoginMethod.LDAP)}
            />
          )}

          {!isLoading && loginError && <Error text={t("login.error-login") ?? ""} />}
          {config.allowSignUp &&
          (shouldDisplayLoginMethod(LoginMethod.EMAIL) ||
            shouldDisplayLoginMethod(LoginMethod.GOOGLE) ||
            shouldDisplayLoginMethod(LoginMethod.GITHUB) ||
            shouldDisplayLoginMethod(LoginMethod.GITLAB)) ? (
            <div className="mt-6 flex flex-row justify-center text-xs text-label">
              <Link to="/signup">
                <span className="cursor-pointer duration-200 hover:text-foreground hover:underline hover:decoration-project/45 hover:underline-offset-2">
                  Don&apos;t have an account yet? {t("login.create-account")}
                </span>
              </Link>
            </div>
          ) : (
            <div className="mt-4" />
          )}
          {shouldDisplayLoginMethod(LoginMethod.EMAIL) && (
            <div className="mt-2 flex flex-row justify-center text-xs text-label">
              <Link to="/account-recovery">
                <span className="cursor-pointer duration-200 hover:text-foreground hover:underline hover:decoration-project/45 hover:underline-offset-2">
                  Recover your account
                </span>
              </Link>
            </div>
          )}
        </UnstableCardContent>
      </UnstableCard>
    </form>
  );
};
