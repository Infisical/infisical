import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { AuthPageFooter } from "@app/components/auth/AuthPageFooter";
import { AuthPageHeader } from "@app/components/auth/AuthPageHeader";
import CodeInputStep from "@app/components/auth/CodeInputStep";
import InitialSignupStep from "@app/components/auth/InitialSignupStep";
import TeamInviteStep from "@app/components/auth/TeamInviteStep";
import UserInfoStep from "@app/components/auth/UserInfoStep";
import { Button } from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { useSelectOrganization } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { createNotification } from "@app/components/notifications";

enum SignupSection {
  Email = "email",
  VerifyCode = "verify-code",
  UserInfo = "user-info",
  InviteTeam = "invite-team"
}

export interface SignUpPageProps {
  invite?: {
    email: string;
  };
}

export const SignUpPage = ({ invite }: SignUpPageProps) => {
  const isInvite = Boolean(invite);
  const [email, setEmail] = useState(invite?.email ?? "");
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

  const handleEmailComplete = () => {
    if (serverDetails?.emailConfigured) {
      setSection(SignupSection.VerifyCode);
    } else {
      setSection(SignupSection.UserInfo);
    }
  };

  const handleCodeVerified = () => {
    setSection(SignupSection.UserInfo);
  };

  const handleUserInfoComplete = async () => {
    if (isInvite) {
      const userOrgs = await fetchOrganizations();
      const orgId = userOrgs[0]?.id;

      if (orgId) {
        await selectOrganization({ organizationId: orgId });
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
          />
        );
      case SignupSection.VerifyCode:
        return <CodeInputStep email={email} onComplete={handleCodeVerified} />;
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

  return (
    <div className="relative flex max-h-screen min-h-screen flex-col overflow-y-auto bg-linear-to-tr from-card via-bunker-900 to-card px-4">
      <AuthPageBackground />
      <Helmet>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") as string} />
        <meta name="og:description" content={t("signup.og-description") as string} />
      </Helmet>
      <AuthPageHeader>
        <Button asChild>
          <Link to="/login">Log In</Link>
        </Button>
      </AuthPageHeader>
      <div className="relative z-10 my-auto flex flex-col items-center py-10">
        <form className="w-full" onSubmit={(e) => e.preventDefault()}>
          {renderView()}
        </form>
      </div>
      <AuthPageFooter />
    </div>
  );
};
