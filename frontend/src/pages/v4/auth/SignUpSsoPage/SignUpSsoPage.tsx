import { useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { jwtDecode } from "jwt-decode";

import SecurityClient from "@app/components/utilities/SecurityClient";
import Telemetry from "@app/components/utilities/telemetry/Telemetry";
import { Button } from "@app/components/v4/ui/button";
import { toast } from "@app/components/v4/ui/sonner";
import { isInfisicalCloud } from "@app/helpers/platform";
import { getHubSpotUtk } from "@app/helpers/utmTracking";
import { useSendEmailVerificationCode } from "@app/hooks/api";
import { useCompleteAccountSignup } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";

import { AuthPage } from "../components/AuthPage";
import { CodeForm } from "../components/CodeForm";
import { useAuthPreview } from "../preview";

import styles from "../auth.module.css";

const CLIENT_RESEND_DELAY_SECONDS = 20;

const decodeEmail = (token: string) => {
  try {
    return (jwtDecode(token) as { email?: string }).email;
  } catch {
    return undefined;
  }
};

export const SignUpSsoPage = () => {
  const navigate = useNavigate();
  const preview = useAuthPreview();
  const { token, callback_port: callbackPort } = useSearch({ from: "/v4/_v4-auth/signup/sso" });
  const email = preview ? "ada@acme.dev" : decodeEmail(token);
  const [code, setCode] = useState("");
  const [resendDelayEnd, setResendDelayEnd] = useState(
    () => Date.now() + CLIENT_RESEND_DELAY_SECONDS * 1000
  );
  const [, forceRender] = useState(0);
  const completeAccountSignup = useCompleteAccountSignup();
  const { mutateAsync: sendEmailVerificationCode, isPending: isResending } =
    useSendEmailVerificationCode();
  const remainingSeconds = Math.max(0, Math.ceil((resendDelayEnd - Date.now()) / 1000));

  useEffect(() => {
    if (!preview) SecurityClient.setSignupToken(token);
  }, [token]);

  useEffect(() => {
    if (remainingSeconds <= 0) return undefined;
    const timer = window.setInterval(() => forceRender((x) => x + 1), 1000);
    return () => window.clearInterval(timer);
  }, [remainingSeconds > 0]);

  const handleSubmit = async () => {
    if (preview) return;
    const telemetry = new Telemetry().getInstance();
    const { token: accessToken } = await completeAccountSignup.mutateAsync({
      type: "alias",
      code,
      hubspotUtk: getHubSpotUtk()
    });

    SecurityClient.setSignupToken("");
    SecurityClient.setToken(accessToken);
    const { organizationId } = jwtDecode(accessToken) as { organizationId?: string };

    if (email) {
      const signupEmail = email.toLowerCase();
      telemetry.identify(signupEmail, signupEmail);
    }

    toast.success("Successfully verified");

    const userOrgs = await fetchOrganizations();
    if (userOrgs.length > 0) {
      if (callbackPort) {
        navigate({
          to: "/v4/login/select-organization",
          search: { org_id: organizationId, callback_port: callbackPort }
        });
      } else if (organizationId) {
        navigate({ to: "/v4/organizations/$orgId/projects", params: { orgId: organizationId } });
      } else {
        navigate({ to: "/v4/login/select-organization" });
      }
      return;
    }

    if (isInfisicalCloud()) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "signup_completed" });
    }

    navigate({ to: "/organizations/onboarding", search: { callback_port: callbackPort } });
  };

  const handleResendCode = async () => {
    if (preview) return;
    try {
      await sendEmailVerificationCode(token);
      setResendDelayEnd(Date.now() + CLIENT_RESEND_DELAY_SECONDS * 1000);
      toast.success("Successfully resent code");
    } catch {
      toast.error("Failed to resend code");
    }
  };

  let resendLabel = "Resend code";
  if (isResending) resendLabel = "Resending";
  else if (remainingSeconds > 0) resendLabel = `Resend code in ${remainingSeconds}s`;

  return (
    <AuthPage
      pageTitle="Sign Up"
      title="Check your email"
      description={
        <>
          Enter the code we sent to <span className={styles.recipient}>{email}</span>
        </>
      }
      footer={
        <span>
          Already have an account?{" "}
          <Link to="/v4/login" search={{ callback_port: callbackPort }} className={styles.link}>
            Log in
          </Link>
        </span>
      }
    >
      <CodeForm
        label="Verification code"
        value={code}
        onChange={setCode}
        onSubmit={handleSubmit}
        isPending={completeAccountSignup.isPending}
        error={
          completeAccountSignup.isError ? "Oops. Your code is wrong. Please try again." : undefined
        }
      >
        <div>
          <Button
            type="button"
            variant="link"
            disabled={completeAccountSignup.isPending || isResending || remainingSeconds > 0}
            onClick={handleResendCode}
          >
            {resendLabel}
          </Button>
        </div>
      </CodeForm>
    </AuthPage>
  );
};
