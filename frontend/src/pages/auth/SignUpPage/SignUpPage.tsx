import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import CodeInputStep from "@app/components/auth/CodeInputStep";
import InitialSignupStep from "@app/components/auth/InitialSignupStep";
import TeamInviteStep from "@app/components/auth/TeamInviteStep";
import UserInfoStep from "@app/components/auth/UserInfoStep";
import { createNotification } from "@app/components/notifications";
import { useServerConfig } from "@app/context";
import { useSelectOrganization } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

enum SignupSection {
  Email = "email",
  VerifyCode = "verify-code",
  UserInfo = "user-info",
  InviteTeam = "invite-team"
}

type PendingEmailVerification = {
  email: string;
  resendCooldownEndTime: number;
};

export interface SignUpPageProps {
  invite?: {
    email: string;
  };
}

export const SignUpPage = ({ invite }: SignUpPageProps) => {
  const isInvite = Boolean(invite);
  const [email, setEmail] = useState(invite?.email ?? "");
  const [pendingEmailVerification, setPendingEmailVerification] =
    useState<PendingEmailVerification | null>(null);
  const [section, setSection] = useState<SignupSection>(
    isInvite ? SignupSection.UserInfo : SignupSection.Email
  );
  const navigate = useNavigate();
  const { data: serverDetails } = useFetchServerStatus();
  const { t } = useTranslation();
  const { config } = useServerConfig();
  const { mutateAsync: selectOrganization } = useSelectOrganization();

  useEffect(() => {
    if (!isInvite && !config.allowSignUp) {
      createNotification({
        text: "Sign up is disabled"
      });
      navigate({ to: "/login" });
    }
  }, [config.allowSignUp]);

  const handleEmailComplete = (verificationEmail: string, cooldownSeconds: number) => {
    setEmail(verificationEmail);
    if (serverDetails?.emailConfigured) {
      setPendingEmailVerification({
        email: verificationEmail,
        resendCooldownEndTime: Date.now() + cooldownSeconds * 1000
      });
      setSection(SignupSection.VerifyCode);
    } else {
      setSection(SignupSection.UserInfo);
    }
  };

  const handleCodeVerified = () => {
    setPendingEmailVerification(null);
    setSection(SignupSection.UserInfo);
  };

  const handleChangeEmail = () => {
    setSection(SignupSection.Email);
  };

  const handleResumeEmailVerification = () => {
    if (!pendingEmailVerification) return;

    setEmail(pendingEmailVerification.email);
    setSection(SignupSection.VerifyCode);
  };

  const handleResendCooldownChange = (resendCooldownEndTime: number) => {
    setPendingEmailVerification((pendingVerification) =>
      pendingVerification ? { ...pendingVerification, resendCooldownEndTime } : null
    );
  };

  const handleUserInfoComplete = async () => {
    if (isInvite) {
      const userOrgs = await fetchOrganizations();
      const orgId = userOrgs[0]?.id;

      if (orgId) {
        const { isMfaEnabled } = await selectOrganization({ organizationId: orgId });

        if (isMfaEnabled) {
          navigate({
            to: "/login/select-organization",
            search: { org_id: orgId }
          });
          return;
        }

        navigate({
          to: "/organizations/$orgId/projects",
          params: { orgId }
        });
      } else {
        navigate({ to: "/login" });
      }
    } else if (serverDetails?.emailConfigured) {
      setSection(SignupSection.InviteTeam);
    } else {
      navigate({ to: "/" });
    }
  };

  const renderView = () => {
    switch (section) {
      case SignupSection.Email:
        return (
          <InitialSignupStep
            email={email}
            setEmail={setEmail}
            incrementStep={handleEmailComplete}
            pendingVerificationEmail={pendingEmailVerification?.email}
            onResumeVerification={handleResumeEmailVerification}
          />
        );
      case SignupSection.VerifyCode:
        return (
          <CodeInputStep
            email={email}
            onComplete={handleCodeVerified}
            onChangeEmail={handleChangeEmail}
            resendCooldownEndTime={pendingEmailVerification?.resendCooldownEndTime ?? 0}
            onResendCooldownChange={handleResendCooldownChange}
          />
        );
      case SignupSection.UserInfo:
        return (
          <UserInfoStep onComplete={handleUserInfoComplete} email={email} isInvite={isInvite} />
        );
      case SignupSection.InviteTeam:
        return <TeamInviteStep />;
      default:
        return null;
    }
  };

  const renderBottomContent = () => {
    if (section === SignupSection.Email) {
      return (
        <p className="text-xs text-pretty text-label">
          By signing up, you agree to our{" "}
          <a
            href="https://infisical.com/terms/cloud"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors duration-200 hover:text-foreground hover:decoration-project/45"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="https://infisical.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors duration-200 hover:text-foreground hover:decoration-project/45"
          >
            Privacy Policy
          </a>
          .
        </p>
      );
    }

    if (section === SignupSection.VerifyCode) {
      return (
        <div className="flex items-center justify-center gap-1.5 text-sm">
          <span className="text-label">Already have an account?</span>
          <Link
            to="/login"
            className="text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project"
          >
            Log in
          </Link>
        </div>
      );
    }

    return undefined;
  };

  return (
    <AuthPageLayout showFooter={false} bottomContent={renderBottomContent()}>
      <Helmet>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") as string} />
        <meta name="og:description" content={t("signup.og-description") as string} />
      </Helmet>
      {section === SignupSection.VerifyCode ? (
        <div className="w-full">{renderView()}</div>
      ) : (
        <form className="w-full" onSubmit={(e) => e.preventDefault()}>
          {renderView()}
        </form>
      )}
    </AuthPageLayout>
  );
};
