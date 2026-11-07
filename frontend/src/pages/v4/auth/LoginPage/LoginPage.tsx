import { type ReactNode, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import attemptLogin from "@app/components/utilities/attemptLogin";
import { useV4Scheme } from "@app/components/v4/scope";
import { AnimatedCollapse } from "@app/components/v4/ui/animated-collapse";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { toast } from "@app/components/v4/ui/sonner";
import { envConfig } from "@app/config/env";
import { useServerConfig } from "@app/context";
import { preserveHubSpotUtk } from "@app/helpers/utmTracking";
import { useFetchServerStatus } from "@app/hooks/api";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { queryClient } from "@app/hooks/api/reactQuery";
import { userKeys } from "@app/hooks/api/users";
import { useLastLogin } from "@app/hooks/useLastLogin";

import { AuthPage } from "../components/AuthPage";
import { PasswordInput } from "../components/PasswordInput";
import { ProviderButton, ProviderMark } from "../components/ProviderButton";
import { RegionSelect } from "../components/RegionSelect";
import { useAuthPreview } from "../preview";

import styles from "../auth.module.css";

const loginFormSchema = z.object({
  email: z.string().email("Please enter a valid email").min(1, "Email is required"),
  password: z.string().min(1, "Password is required")
});

type LoginFormData = z.infer<typeof loginFormSchema>;

type SocialLoginMethod = LoginMethod.GOOGLE | LoginMethod.GITHUB | LoginMethod.GITLAB;
type OrgLoginMethod = LoginMethod.LDAP | LoginMethod.OIDC | LoginMethod.SAML;

type LoginOption = {
  id: LoginMethod;
  kind: "social" | "organization";
  render: (options: { showLabel: boolean; isLastUsed: boolean }) => ReactNode;
};

const SOCIAL_METHODS: { method: SocialLoginMethod; label: string }[] = [
  { method: LoginMethod.GOOGLE, label: "Continue with Google" },
  { method: LoginMethod.GITHUB, label: "Continue with GitHub" },
  { method: LoginMethod.GITLAB, label: "Continue with GitLab" }
];

const LOGIN_ERROR = "Login unsuccessful. Double-check your credentials and try again.";

export const LoginPage = ({ isAdmin }: { isAdmin?: boolean }) => {
  const navigate = useNavigate();
  const preview = useAuthPreview();
  const scheme = useV4Scheme();
  const { config } = useServerConfig();
  const { data: serverDetails } = useFetchServerStatus();
  const { lastLogin, saveLastLogin } = useLastLogin();
  const { callback_port: callbackPortNumber } = useSearch({ from: "/v4/_v4-auth" });
  const callbackPort = callbackPortNumber ? String(callbackPortNumber) : null;

  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(preview === "error");
  const [captchaToken, setCaptchaToken] = useState("");
  const [shouldShowCaptcha, setShouldShowCaptcha] = useState(false);
  const [areMoreOptionsVisible, setAreMoreOptionsVisible] = useState(false);
  const [areSsoOptionsVisible, setAreSsoOptionsVisible] = useState(false);
  const captchaRef = useRef<HCaptcha>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, submitCount }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginFormSchema),
    mode: "onChange",
    defaultValues:
      preview === "error"
        ? { email: "ada@acme.dev", password: "not-my-password" }
        : { email: "", password: "" }
  });
  const showDangerState = submitCount > 0;

  const redirectToSaml = (orgSlug: string) => {
    const redirectUrl = `/api/v1/sso/redirect/saml2/organizations/${encodeURIComponent(orgSlug)}${
      callbackPort ? `?callback_port=${encodeURIComponent(callbackPort)}` : ""
    }`;
    window.location.assign(redirectUrl);
  };

  const redirectToOidc = (orgSlug: string) => {
    const query = new URLSearchParams({ orgSlug });
    if (callbackPort) query.set("callbackPort", callbackPort);
    window.location.assign(`/api/v1/sso/oidc/login?${query.toString()}`);
  };

  useEffect(() => {
    if (preview) return;
    if (serverDetails?.samlDefaultOrgSlug && !isAdmin) {
      saveLastLogin({
        method: LoginMethod.SAML,
        identifier: { type: "orgSlug", value: serverDetails.samlDefaultOrgSlug }
      });
      redirectToSaml(serverDetails.samlDefaultOrgSlug);
    }
  }, [serverDetails?.samlDefaultOrgSlug]);

  const handleOrganizationLogin = (method: OrgLoginMethod) => {
    if (method === LoginMethod.LDAP) {
      navigate({
        to: "/v4/login/ldap",
        search: {
          callback_port: callbackPort ? Number(callbackPort) : undefined,
          is_admin_login: isAdmin || undefined,
          organizationSlug: config.defaultAuthOrgSlug || "",
          username: undefined
        }
      });
      return;
    }

    if (config.defaultAuthOrgSlug) {
      saveLastLogin({ method, identifier: { type: "orgSlug", value: config.defaultAuthOrgSlug } });
      if (method === LoginMethod.SAML) redirectToSaml(config.defaultAuthOrgSlug);
      else redirectToOidc(config.defaultAuthOrgSlug);
      return;
    }

    navigate({
      to: method === LoginMethod.OIDC ? "/v4/login/oidc" : "/v4/login/saml",
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
    if (callbackPort) searchParams.append("callback_port", callbackPort);
    if (isAdmin) searchParams.append("is_admin_login", "true");
    const qs = searchParams.toString();
    saveLastLogin({ method });
    window.location.replace(`/api/v1/sso/redirect/${method}${qs ? `?${qs}` : ""}`);
  };

  const lastUsedMethod = preview === "last-used" ? LoginMethod.GITHUB : lastLogin?.method;
  const shouldDisplayLoginMethod = (method: LoginMethod) =>
    isAdmin || !config.enabledLoginMethods || config.enabledLoginMethods.includes(method);

  const loginOptions: LoginOption[] = [
    ...SOCIAL_METHODS.filter(({ method }) => shouldDisplayLoginMethod(method)).map(
      ({ method, label }) => ({
        id: method,
        kind: "social" as const,
        render: ({ showLabel, isLastUsed }: { showLabel: boolean; isLastUsed: boolean }) => (
          <ProviderButton
            key={method}
            provider={method}
            label={label}
            ariaLabel={label}
            showLabel={showLabel}
            badge={isLastUsed ? "Last used" : undefined}
            onClick={() => handleSocialLogin(method)}
          />
        )
      })
    ),
    ...([LoginMethod.LDAP, LoginMethod.OIDC, LoginMethod.SAML] as const)
      .filter(shouldDisplayLoginMethod)
      .map((method) => ({
        id: method,
        kind: "organization" as const,
        render: ({ isLastUsed }: { showLabel: boolean; isLastUsed: boolean }) => (
          <ProviderButton
            key={method}
            provider={method}
            label={`Continue with ${method.toUpperCase()}`}
            ariaLabel={`Continue with ${method.toUpperCase()}`}
            badge={isLastUsed ? "Last used" : undefined}
            onClick={() => handleOrganizationLogin(method)}
          />
        )
      }))
  ];
  const lastUsedOption = loginOptions.find(({ id }) => id === lastUsedMethod);
  const otherOptions = loginOptions.filter(({ id }) => id !== lastUsedOption?.id);
  const socialOptions = loginOptions.filter(({ kind }) => kind === "social");
  const organizationOptions = loginOptions.filter(({ kind }) => kind === "organization");

  const handleLoginFailure = () => {
    setLoginError(true);
    toast.error(
      callbackPort
        ? "CLI login unsuccessful. Double-check your credentials and try again."
        : LOGIN_ERROR
    );
  };

  const handleEmailLogin = async (formData: LoginFormData) => {
    if (preview) return;
    setIsLoading(true);
    try {
      const loginResult = await attemptLogin({
        email: formData.email.toLowerCase(),
        password: formData.password,
        captchaToken
      });
      if (loginResult?.success) {
        saveLastLogin({ method: LoginMethod.EMAIL });
        if (!config.defaultAuthOrgId) queryClient.invalidateQueries({ queryKey: userKeys.getUser });
        navigate({
          to: "/v4/login/select-organization",
          search: {
            callback_port: callbackPort ? Number(callbackPort) : undefined,
            org_id: config.defaultAuthOrgId,
            is_admin_login: isAdmin
          }
        });
      } else {
        handleLoginFailure();
      }
    } catch (err: any) {
      console.error(err);
      if (err.response?.data?.error === "Captcha Required") setShouldShowCaptcha(true);
      else handleLoginFailure();
    } finally {
      captchaRef.current?.resetCaptcha();
      setCaptchaToken("");
      setIsLoading(false);
    }
  };

  const isEnforced =
    preview === "enforced" ||
    Boolean(config.defaultAuthOrgAuthEnforced && config.defaultAuthOrgAuthMethod && !isAdmin);

  if (isEnforced) {
    const method = config.defaultAuthOrgAuthMethod === "oidc" ? LoginMethod.OIDC : LoginMethod.SAML;
    return (
      <AuthPage pageTitle="Login" title="Log in to Infisical" titleAction={<RegionSelect />}>
        <ProviderButton
          provider={method}
          label={`Continue with ${method.toUpperCase()}`}
          ariaLabel={`Continue with ${method.toUpperCase()}`}
          onClick={() => handleOrganizationLogin(method)}
        />
      </AuthPage>
    );
  }

  const canUseEmail = shouldDisplayLoginMethod(LoginMethod.EMAIL);
  const canSignUp =
    config.allowSignUp &&
    [LoginMethod.EMAIL, LoginMethod.GOOGLE, LoginMethod.GITHUB, LoginMethod.GITLAB].some(
      shouldDisplayLoginMethod
    );

  const renderButtonOptions = () => {
    if (loginOptions.length === 0) return null;
    if (lastUsedOption) {
      return (
        <Stack gap={8}>
          {lastUsedOption.render({ showLabel: true, isLastUsed: true })}
          {otherOptions.length > 0 && !areMoreOptionsVisible && (
            <Button
              type="button"
              variant="ghost"
              aria-expanded={false}
              onClick={() => setAreMoreOptionsVisible(true)}
            >
              + {otherOptions.length} more {otherOptions.length === 1 ? "option" : "options"}
            </Button>
          )}
          <AnimatedCollapse open={areMoreOptionsVisible}>
            <Stack gap={8}>
              {otherOptions.map((option) => option.render({ showLabel: true, isLastUsed: false }))}
            </Stack>
          </AnimatedCollapse>
        </Stack>
      );
    }
    return (
      <Stack gap={8}>
        {socialOptions.length > 0 && (
          <div className={styles.providers}>
            {socialOptions.map((option) => option.render({ showLabel: false, isLastUsed: false }))}
          </div>
        )}
        {organizationOptions.length > 0 && !areSsoOptionsVisible && (
          <Button
            type="button"
            variant="ghost"
            aria-expanded={false}
            onClick={() => setAreSsoOptionsVisible(true)}
          >
            View SSO options
          </Button>
        )}
        <AnimatedCollapse open={areSsoOptionsVisible}>
          <Stack gap={8}>
            {organizationOptions.map((option) =>
              option.render({ showLabel: true, isLastUsed: false })
            )}
          </Stack>
        </AnimatedCollapse>
      </Stack>
    );
  };

  return (
    <AuthPage
      pageTitle={isAdmin ? "Admin Login" : "Login"}
      title="Welcome back"
      description={
        isAdmin ? "Sign in to the Super Admin console" : "Sign in to your Infisical account"
      }
      titleAction={<RegionSelect />}
      bottom={
        canUseEmail ? (
          <span>
            Help me{" "}
            <Link to="/account-recovery" className={styles.link}>
              recover my account
            </Link>
          </span>
        ) : undefined
      }
      footer={
        canSignUp ? (
          <span>
            Don&apos;t have an account?{" "}
            <Link
              to="/v4/signup"
              search={{ callback_port: callbackPort ? Number(callbackPort) : undefined }}
              className={styles.link}
            >
              Sign up
            </Link>
          </span>
        ) : undefined
      }
    >
      {renderButtonOptions()}
      {loginOptions.length > 0 && canUseEmail && <div className={styles.divider}>or</div>}
      {canUseEmail && (
        <form onSubmit={handleSubmit(handleEmailLogin)} noValidate>
          <Stack gap={16}>
            <Field label="Email" error={showDangerState ? errors.email?.message : undefined}>
              <Input
                {...register("email", { onChange: () => setLoginError(false) })}
                type="email"
                size="lg"
                placeholder="you@company.com"
                autoComplete="username"
                invalid={loginError}
              />
            </Field>
            <Field
              label="Password"
              error={
                loginError
                  ? LOGIN_ERROR
                  : (showDangerState && errors.password?.message) || undefined
              }
            >
              <PasswordInput
                {...register("password", { onChange: () => setLoginError(false) })}
                autoComplete="current-password"
                invalid={loginError}
              />
            </Field>
            {shouldShowCaptcha && envConfig.CAPTCHA_SITE_KEY && (
              <div className={styles.captcha}>
                <HCaptcha
                  theme={scheme === "dark" ? "dark" : "light"}
                  sitekey={envConfig.CAPTCHA_SITE_KEY}
                  onVerify={(token) => setCaptchaToken(token)}
                  ref={captchaRef}
                />
              </div>
            )}
            <Button
              type="submit"
              variant="accent"
              size="lg"
              className="w-full"
              loading={isLoading}
              disabled={!isValid || (shouldShowCaptcha && captchaToken === "")}
              cornerBadge={
                lastUsedMethod === LoginMethod.EMAIL ? (
                  <Badge tone="accent" size="sm">
                    Last used
                  </Badge>
                ) : undefined
              }
            >
              <ProviderMark provider="email" />
              Continue with email
            </Button>
          </Stack>
        </form>
      )}
    </AuthPage>
  );
};
