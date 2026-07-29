import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthTermsNotice } from "@app/components/auth/AuthTermsNotice";
import CodeInputStep from "@app/components/auth/CodeInputStep";
import InitialSignupStep from "@app/components/auth/InitialSignupStep";
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

// Email entry and code verification share a step; the completion summary shows no counter.
const STEP_NUMBERS: Partial<Record<SignupSection, number>> = {
  [SignupSection.Email]: 1,
  [SignupSection.VerifyCode]: 1,
  [SignupSection.UserInfo]: 2,
  [SignupSection.ProductSelect]: 3,
  [SignupSection.InviteTeam]: 4
};

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
  const [orgId, setOrgId] = useState("");
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
          <UserInfoStep onComplete={handleUserInfoComplete} email={email} isInvite={isInvite} />
        );
      case SignupSection.ProductSelect:
        return <ProductSelectionStep onComplete={handleProductSelectComplete} />;
      case SignupSection.InviteTeam:
        return (
          <TeamInviteStep
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
    if (
      section === SignupSection.Email ||
      section === SignupSection.ProductSelect ||
      section === SignupSection.InviteTeam ||
      section === SignupSection.Complete
    ) {
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

  // Without an email service the invite step is skipped, so the counter tops out at 3.
  const totalSteps = serverDetails?.emailConfigured ? 4 : 3;
  const stepNumber = STEP_NUMBERS[section];
  const stepIndicator =
    !isInvite && stepNumber ? (
      <span className="rounded-sm border border-border bg-container/50 px-2.5 py-0.5 font-jetbrains-mono text-[10px] tracking-widest text-muted uppercase">
        Step {stepNumber} of {totalSteps}
      </span>
    ) : undefined;

  const completeAsideDescription = (() => {
    if (selectedProducts.length === 0) return "Your organization overview has everything laid out.";
    if (selectedProducts.length === 1) {
      return `${getSignupProduct(selectedProducts[0])?.name} is set up and ready to use.`;
    }
    return "Your products are set up and ready to go.";
  })();
  const asideContent = (() => {
    switch (section) {
      case SignupSection.ProductSelect:
        return {
          eyebrow: "One platform, five products",
          description:
            "Secrets, PKI, KMS, privileged access, and scanning. Start where it hurts most."
        };
      case SignupSection.InviteTeam:
        return {
          eyebrow: "Better together",
          description: "Infisical works best when your whole team is in one place."
        };
      case SignupSection.Complete:
        return {
          eyebrow: "You're all set",
          description: completeAsideDescription
        };
      default:
        return undefined;
    }
  })();

  return (
    <AuthPageLayout
      showFooter={false}
      bottomContent={renderBottomContent()}
      headerAction={stepIndicator}
      aside={asideContent}
    >
      <Helmet>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") as string} />
        <meta name="og:description" content={t("signup.og-description") as string} />
      </Helmet>
      {section === SignupSection.VerifyCode ||
      section === SignupSection.ProductSelect ||
      section === SignupSection.Complete ? (
        <div className="w-full">{renderView()}</div>
      ) : (
        <form className="w-full" onSubmit={(e) => e.preventDefault()}>
          {renderView()}
        </form>
      )}
    </AuthPageLayout>
  );
};
