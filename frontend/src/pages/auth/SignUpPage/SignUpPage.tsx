import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";

import { OnboardingStepTransition } from "@app/components/auth/OnboardingStepTransition";
import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthTermsNotice } from "@app/components/auth/AuthTermsNotice";
import CodeInputStep from "@app/components/auth/CodeInputStep";
import InitialSignupStep from "@app/components/auth/InitialSignupStep";
import { OnboardingProgress } from "@app/components/auth/OnboardingPageLayout";
import ProductSelectionStep from "@app/components/auth/ProductSelectionStep";
import SignupCompleteStep from "@app/components/auth/SignupCompleteStep";
import { getSignupProduct, SignupProductType } from "@app/components/auth/signupProducts";
import TeamInviteStep from "@app/components/auth/TeamInviteStep";
import UserInfoStep from "@app/components/auth/UserInfoStep";
import { createNotification } from "@app/components/notifications";
import { useServerConfig } from "@app/context";
import { useSelectOrganization } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { Project, ProjectType } from "@app/hooks/api/projects/types";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

enum SignupSection {
  Email = "email",
  VerifyCode = "verify-code",
  UserInfo = "user-info",
  ProductSelect = "product-select",
  InviteTeam = "invite-team",
  Complete = "complete"
}

type PendingEmailVerification = {
  email: string;
  resendCooldownEndTime: number;
};

export interface SignUpPageProps {
  invite?: {
    email: string;
    organizationName?: string;
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
  const [orgId, setOrgId] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");
  const projectCache = useRef<Partial<Record<SignupProductType, Project>>>({});
  // An empty selection means "just exploring".
  const [selectedProducts, setSelectedProducts] = useState<SignupProductType[]>([]);
  const [createdProjects, setCreatedProjects] = useState<
    Partial<Record<SignupProductType, Project>>
  >({});
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

  const handleUserInfoComplete = async (newOrgId?: string) => {
    if (isInvite) {
      const userOrgs = await fetchOrganizations();
      const inviteOrgId = userOrgs[0]?.id;

      if (inviteOrgId) {
        const { isMfaEnabled } = await selectOrganization({ organizationId: inviteOrgId });

        if (isMfaEnabled) {
          navigate({
            to: "/login/select-organization",
            search: { org_id: inviteOrgId }
          });
          return;
        }

        navigate({
          to: "/organizations/$orgId/projects",
          params: { orgId: inviteOrgId }
        });
      } else {
        navigate({ to: "/login" });
      }
      return;
    }

    if (newOrgId) {
      setOrgId(newOrgId);
    }
    setSection(SignupSection.ProductSelect);
  };

  const handleProductSelectComplete = (
    products: SignupProductType[],
    projects: Partial<Record<SignupProductType, Project>>
  ) => {
    setSelectedProducts(products);
    setCreatedProjects(projects);
    // The invite step needs a working email service; skip straight to the summary without one.
    setSection(serverDetails?.emailConfigured ? SignupSection.InviteTeam : SignupSection.Complete);
  };

  const handleInviteComplete = () => {
    setSection(SignupSection.Complete);
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
          <UserInfoStep
            onComplete={handleUserInfoComplete}
            email={email}
            isInvite={isInvite}
            inviteOrganizationName={invite?.organizationName}
          />
        );
      case SignupSection.ProductSelect:
        return (
          <ProductSelectionStep
            onComplete={handleProductSelectComplete}
            initialProducts={selectedProducts}
            projectCache={projectCache}
          />
        );
      case SignupSection.InviteTeam:
        return (
          <TeamInviteStep
            emails={inviteEmails}
            onEmailsChange={setInviteEmails}
            onBack={() => setSection(SignupSection.ProductSelect)}
            productName={
              selectedProducts.length === 1
                ? getSignupProduct(selectedProducts[0])?.name
                : undefined
            }
            projectIds={Object.values(createdProjects).flatMap((project) =>
              project ? [project.id] : []
            )}
            grantPamAccess={selectedProducts.includes(ProjectType.PAM)}
            onComplete={handleInviteComplete}
          />
        );
      case SignupSection.Complete:
        return (
          <SignupCompleteStep
            orgId={orgId || (localStorage.getItem("orgData.id") ?? "")}
            products={selectedProducts}
            projects={createdProjects}
          />
        );
      default:
        return null;
    }
  };

  const renderBottomContent = () => {
    if (section === SignupSection.Email) {
      return <AuthTermsNotice />;
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

  const isWorkspaceSetup =
    section === SignupSection.ProductSelect ||
    section === SignupSection.InviteTeam ||
    section === SignupSection.Complete;

  const postAuthSteps = serverDetails?.emailConfigured
    ? [SignupSection.ProductSelect, SignupSection.InviteTeam, SignupSection.Complete]
    : [SignupSection.ProductSelect, SignupSection.Complete];
  const stepIndicator =
    !isInvite && isWorkspaceSetup ? (
      <OnboardingProgress
        currentStep={postAuthSteps.indexOf(section) + 1}
        totalSteps={postAuthSteps.length}
      />
    ) : undefined;

  return (
    <AuthPageLayout
      showFooter={false}
      bottomContent={renderBottomContent()}
      headerAction={stepIndicator}
      variant={isWorkspaceSetup ? "focused" : "split"}
      contentClassName={isWorkspaceSetup ? "max-w-3xl" : undefined}
    >
      <Helmet>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") as string} />
        <meta name="og:description" content={t("signup.og-description") as string} />
      </Helmet>
      <OnboardingStepTransition step={section}>
        {section === SignupSection.VerifyCode ||
        section === SignupSection.ProductSelect ||
        section === SignupSection.Complete ? (
          <div className="w-full">{renderView()}</div>
        ) : (
          <form className="w-full" onSubmit={(e) => e.preventDefault()}>
            {renderView()}
          </form>
        )}
      </OnboardingStepTransition>
    </AuthPageLayout>
  );
};
