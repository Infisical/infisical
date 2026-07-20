import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { faGithub, faGitlab, faGoogle } from "@fortawesome/free-brands-svg-icons";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { z } from "zod";

import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import Error from "@app/components/basic/Error";
import { RegionSelect } from "@app/components/navigation/RegionSelect";
import { createNotification } from "@app/components/notifications";
import attemptLogin from "@app/components/utilities/attemptLogin";
import {
  AnimatedCollapse,
  Button,
  ButtonBadge,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldSeparator,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v3";
import { envConfig } from "@app/config/env";
import { useServerConfig } from "@app/context";
import { preserveHubSpotUtk } from "@app/helpers/utmTracking";
import { useFetchServerStatus } from "@app/hooks/api";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { LEGACY_GENERIC_SSO_LOGIN_METHOD, useLastLogin } from "@app/hooks/useLastLogin";

import { useNavigateToSelectOrganization } from "../../Login.utils";
import { OrgLoginButton } from "../OrgLoginButton";
import { SocialLoginButton } from "../SocialLoginButton";

const loginFormSchema = z.object({
  email: z.string().email("Please enter a valid email").min(1, "Email is required"),
  password: z.string().min(1, "Password is required")
});

type LoginFormData = z.infer<typeof loginFormSchema>;

type Props = {
  isAdmin?: boolean;
};

type SocialLoginMethod = LoginMethod.GOOGLE | LoginMethod.GITHUB | LoginMethod.GITLAB;

type LoginOptionDescriptor = {
  id: string;
  kind: "social" | "organization";
  isLastUsed: boolean;
  render: (showLastUsed: boolean, showLabel?: boolean) => ReactNode;
};

export const InitialStep = ({ isAdmin }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const { config } = useServerConfig();
  const queryParams = new URLSearchParams(window.location.search);
  const [captchaToken, setCaptchaToken] = useState("");
  const [shouldShowCaptcha, setShouldShowCaptcha] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [areMoreLoginOptionsVisible, setAreMoreLoginOptionsVisible] = useState(false);
  const captchaRef = useRef<HCaptcha>(null);
  const { data: serverDetails } = useFetchServerStatus();

  const { navigateToSelectOrganization } = useNavigateToSelectOrganization();
  const { lastLogin, saveLastLogin } = useLastLogin();

  const callbackPort = queryParams.get("callback_port");

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, submitCount }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginFormSchema),
    mode: "onChange",
    defaultValues: {
      email: "",
      password: ""
    }
  });
  const showDangerState = submitCount > 0;

  const redirectToSaml = (orgSlug: string) => {
    const redirectUrl = `/api/v1/sso/redirect/saml2/organizations/${orgSlug}${
      callbackPort ? `?callback_port=${encodeURIComponent(callbackPort)}` : ""
    }`;
    window.location.assign(redirectUrl);
  };

  useEffect(() => {
    if (serverDetails?.samlDefaultOrgSlug && !isAdmin) {
      saveLastLogin({
        method: LoginMethod.SAML,
        identifier: { type: "orgSlug", value: serverDetails.samlDefaultOrgSlug }
      });
      redirectToSaml(serverDetails.samlDefaultOrgSlug);
    }
  }, [serverDetails?.samlDefaultOrgSlug]);

  const handleSso = () => {
    navigate({
      to: "/login/sso",
      search: {
        callback_port: callbackPort ? Number(callbackPort) : undefined,
        is_admin_login: isAdmin || undefined,
        organizationSlug: config.defaultAuthOrgSlug || undefined
      }
    });
  };

  const handleSocialLogin = (method: SocialLoginMethod) => {
    preserveHubSpotUtk();
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

  const shouldDisplaySso = [LoginMethod.SAML, LoginMethod.OIDC, LoginMethod.LDAP].some(
    shouldDisplayLoginMethod
  );
  const isLastUsedSso = Boolean(
    lastLogin &&
      ((lastLogin.method === LEGACY_GENERIC_SSO_LOGIN_METHOD &&
        [LoginMethod.SAML, LoginMethod.OIDC].some(shouldDisplayLoginMethod)) ||
        (lastLogin.method === LoginMethod.SAML && shouldDisplayLoginMethod(LoginMethod.SAML)) ||
        (lastLogin.method === LoginMethod.OIDC && shouldDisplayLoginMethod(LoginMethod.OIDC)) ||
        (lastLogin.method === LoginMethod.LDAP && shouldDisplayLoginMethod(LoginMethod.LDAP)))
  );

  const socialLoginMethods = (
    [
      {
        method: LoginMethod.GOOGLE,
        icon: faGoogle,
        label: t("login.continue-with-google")
      },
      {
        method: LoginMethod.GITHUB,
        icon: faGithub,
        label: "Continue with GitHub"
      },
      {
        method: LoginMethod.GITLAB,
        icon: faGitlab,
        label: "Continue with GitLab"
      }
    ] satisfies { method: SocialLoginMethod; icon: typeof faGoogle; label: string }[]
  ).filter(({ method }) => shouldDisplayLoginMethod(method));

  const loginOptions: LoginOptionDescriptor[] = [
    ...socialLoginMethods.map(({ method, icon, label }) => ({
      id: method,
      kind: "social" as const,
      isLastUsed: isLastUsedMethod(method),
      render: (showLastUsed: boolean, showLabel = false) => (
        <SocialLoginButton
          icon={icon}
          label={label}
          onClick={() => handleSocialLogin(method)}
          showLabel={showLabel}
          showLastUsed={showLastUsed}
        />
      )
    })),
    ...(shouldDisplaySso
      ? [
          {
            id: "organization-sso",
            kind: "organization" as const,
            isLastUsed: isLastUsedSso,
            render: (showLastUsed: boolean) => (
              <OrgLoginButton
                label="Sign in with SSO/LDAP"
                onClick={handleSso}
                showLastUsed={showLastUsed}
              />
            )
          }
        ]
      : [])
  ];
  const lastUsedLoginOption = loginOptions.find(({ isLastUsed }) => isLastUsed);
  const orderedLoginOptions = lastUsedLoginOption
    ? [lastUsedLoginOption, ...loginOptions.filter(({ id }) => id !== lastUsedLoginOption.id)]
    : loginOptions;
  const additionalLoginOptions = lastUsedLoginOption ? orderedLoginOptions.slice(1) : [];
  const socialLoginOptions = loginOptions.filter(({ kind }) => kind === "social");
  const organizationLoginOptions = loginOptions.filter(({ kind }) => kind === "organization");
  const moreLoginOptionsCount = lastUsedLoginOption ? loginOptions.length - 1 : 0;
  const hasButtonLoginMethod = loginOptions.length > 0;
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
        <AuthPagePanel>
          <CardHeader className="mb-8 gap-2">
            <CardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text font-alliance text-2xl font-normal text-transparent">
              Log in to Infisical
            </CardTitle>
            <CardAction className="-mr-2">
              <RegionSelect compact />
            </CardAction>
          </CardHeader>
          <CardContent>
            <OrgLoginButton label="Sign in with SSO/LDAP" onClick={handleSso} />
          </CardContent>
        </AuthPagePanel>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(handleEmailLogin)}
      className="mx-auto flex w-full flex-col items-center justify-center"
    >
      <AuthPagePanel>
        <CardHeader className="mb-6 gap-2">
          <CardTitle className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text font-alliance text-2xl font-normal text-transparent">
            Welcome back
          </CardTitle>
          <CardDescription className="ml-0.5 text-base">
            {isAdmin ? "Sign in to the Super Admin console" : "Sign in to your Infisical account"}
          </CardDescription>
          <CardAction className="-mr-2">
            <RegionSelect compact />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasButtonLoginMethod && (
            <div className="flex w-full flex-col">
              {lastUsedLoginOption ? (
                <>
                  {lastUsedLoginOption.render(true, true)}
                  {moreLoginOptionsCount > 0 && (
                    <AnimatedCollapse isOpen={!areMoreLoginOptionsVisible}>
                      <div className="pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          isFullWidth
                          className="text-accent hover:text-foreground"
                          aria-controls="additional-login-options"
                          aria-expanded={areMoreLoginOptionsVisible}
                          onClick={() => setAreMoreLoginOptionsVisible(true)}
                        >
                          + {moreLoginOptionsCount} more options
                        </Button>
                      </div>
                    </AnimatedCollapse>
                  )}
                  <AnimatedCollapse
                    id="additional-login-options"
                    isOpen={areMoreLoginOptionsVisible}
                  >
                    <div className="flex w-full flex-col gap-2 pt-2">
                      {additionalLoginOptions.map((option) => (
                        <Fragment key={option.id}>{option.render(false, true)}</Fragment>
                      ))}
                    </div>
                  </AnimatedCollapse>
                </>
              ) : (
                <div className="flex w-full flex-col gap-2">
                  {socialLoginOptions.length > 0 && (
                    <div className="flex w-full gap-2">
                      {socialLoginOptions.map((option) => (
                        <Fragment key={option.id}>{option.render(false)}</Fragment>
                      ))}
                    </div>
                  )}
                  {organizationLoginOptions.map((option) => (
                    <Fragment key={option.id}>{option.render(false, true)}</Fragment>
                  ))}
                </div>
              )}
            </div>
          )}
          {hasButtonLoginMethod && shouldDisplayLoginMethod(LoginMethod.EMAIL) && (
            <FieldSeparator>or</FieldSeparator>
          )}
          {shouldDisplayLoginMethod(LoginMethod.EMAIL) && (
            <div className="flex w-full flex-col gap-4">
              <Input
                {...register("email", { onChange: () => setLoginError(false) })}
                type="email"
                id="email"
                placeholder="you@company.com"
                autoComplete="username"
                className="h-10"
                isError={(showDangerState && Boolean(errors.email)) || loginError}
              />
              <InputGroup className="h-10">
                <InputGroupInput
                  {...register("password", { onChange: () => setLoginError(false) })}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  id="current-password"
                  aria-invalid={(showDangerState && Boolean(errors.password)) || loginError}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              {shouldShowCaptcha && envConfig.CAPTCHA_SITE_KEY && (
                <div className="flex justify-center [&>div]:!w-full">
                  <HCaptcha
                    theme="dark"
                    sitekey={envConfig.CAPTCHA_SITE_KEY}
                    onVerify={(token) => setCaptchaToken(token)}
                    ref={captchaRef}
                  />
                </div>
              )}
              <Button
                type="submit"
                variant="project"
                size="lg"
                isFullWidth
                isDisabled={!isValid || (shouldShowCaptcha && captchaToken === "") || isLoading}
                isPending={isLoading}
              >
                Continue with Email
                {isLastUsedMethod(LoginMethod.EMAIL) && (
                  <ButtonBadge variant="project">Last used</ButtonBadge>
                )}
              </Button>
            </div>
          )}

          {!isLoading && loginError && <Error text={t("login.error-login") ?? ""} />}
        </CardContent>
      </AuthPagePanel>
      {config.allowSignUp &&
        (shouldDisplayLoginMethod(LoginMethod.EMAIL) ||
          shouldDisplayLoginMethod(LoginMethod.GOOGLE) ||
          shouldDisplayLoginMethod(LoginMethod.GITHUB) ||
          shouldDisplayLoginMethod(LoginMethod.GITLAB)) && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-sm">
            <span className="text-label">Don&apos;t have an account?</span>
            <Link
              to="/signup"
              className="text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project"
            >
              Sign up
            </Link>
          </div>
        )}
    </form>
  );
};
