import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthTermsNotice } from "@app/components/auth/AuthTermsNotice";
import { OnboardingProgress } from "@app/components/auth/OnboardingPageLayout";
import { OnboardingStepTransition } from "@app/components/auth/OnboardingStepTransition";
import OrgNameStep from "@app/components/auth/OrgNameStep";
import ProductSelectionStep from "@app/components/auth/ProductSelectionStep";
import SignupCompleteStep from "@app/components/auth/SignupCompleteStep";
import { getSignupProduct, SignupProductType } from "@app/components/auth/signupProducts";
import TeamInviteStep from "@app/components/auth/TeamInviteStep";
import { ContentLoader } from "@app/components/v2";
import { useSelectOrganization } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { Project, ProjectType } from "@app/hooks/api/projects/types";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

enum OnboardingSection {
  Loading = "loading",
  OrgName = "org-name",
  ProductSelect = "product-select",
  InviteTeam = "invite-team",
  Complete = "complete"
}

/**
 * Org setup for freshly signed-up people who have no organization yet: provider-verified
 * OAuth signups (which bypass /signup/sso) and code-verified SSO signups both land here.
 */
export const SignupOnboardingPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: serverDetails } = useFetchServerStatus();
  const { mutateAsync: selectOrganization } = useSelectOrganization();

  const [section, setSection] = useState<OnboardingSection>(OnboardingSection.Loading);
  const [orgId, setOrgId] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");
  const projectCache = useRef<Partial<Record<SignupProductType, Project>>>({});
  // An empty selection means "just exploring".
  const [selectedProducts, setSelectedProducts] = useState<SignupProductType[]>([]);
  const [createdProjects, setCreatedProjects] = useState<
    Partial<Record<SignupProductType, Project>>
  >({});

  // Guards against React strict-mode's double-invoke re-running the entry check.
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    // A refresh mid-flow can arrive with the org already created; resume at product
    // selection instead of prompting for (and creating) a second org.
    const resolveEntrySection = async () => {
      try {
        const orgs = await fetchOrganizations();
        if (orgs.length === 0) {
          setSection(OnboardingSection.OrgName);
          return;
        }

        const existingOrgId = orgs[0].id;
        const { isMfaEnabled } = await selectOrganization({ organizationId: existingOrgId });
        if (isMfaEnabled) {
          navigate({
            to: "/login/select-organization",
            search: { org_id: existingOrgId }
          });
          return;
        }
        localStorage.setItem("orgData.id", existingOrgId);
        setOrgId(existingOrgId);
        setSection(OnboardingSection.ProductSelect);
      } catch {
        navigate({ to: "/login/select-organization" });
      }
    };

    resolveEntrySection();
  }, [selectOrganization, navigate]);

  const handleOrgNameComplete = (newOrgId: string) => {
    setOrgId(newOrgId);
    setSection(OnboardingSection.ProductSelect);
  };

  const handleProductSelectComplete = (
    products: SignupProductType[],
    projects: Partial<Record<SignupProductType, Project>>
  ) => {
    setSelectedProducts(products);
    setCreatedProjects(projects);
    // The invite step needs a working email service; skip straight to the summary without one.
    setSection(
      serverDetails?.emailConfigured ? OnboardingSection.InviteTeam : OnboardingSection.Complete
    );
  };

  const renderView = () => {
    switch (section) {
      case OnboardingSection.OrgName:
        return <OrgNameStep onComplete={handleOrgNameComplete} />;
      case OnboardingSection.ProductSelect:
        return (
          <ProductSelectionStep
            onComplete={handleProductSelectComplete}
            initialProducts={selectedProducts}
            projectCache={projectCache}
          />
        );
      case OnboardingSection.InviteTeam:
        return (
          <TeamInviteStep
            emails={inviteEmails}
            onEmailsChange={setInviteEmails}
            onBack={() => setSection(OnboardingSection.ProductSelect)}
            productName={
              selectedProducts.length === 1
                ? getSignupProduct(selectedProducts[0])?.name
                : undefined
            }
            projectIds={Object.values(createdProjects).flatMap((project) =>
              project ? [project.id] : []
            )}
            grantPamAccess={selectedProducts.includes(ProjectType.PAM)}
            grantAgentVaultAccess={selectedProducts.includes(ProjectType.AgentVault)}
            onComplete={() => setSection(OnboardingSection.Complete)}
          />
        );
      case OnboardingSection.Complete:
        return (
          <SignupCompleteStep
            orgId={orgId}
            products={selectedProducts}
            projects={createdProjects}
          />
        );
      default:
        return <ContentLoader text="Loading your account..." />;
    }
  };

  const isWorkspaceSetup =
    section === OnboardingSection.ProductSelect ||
    section === OnboardingSection.InviteTeam ||
    section === OnboardingSection.Complete;

  const postAuthSteps = serverDetails?.emailConfigured
    ? [OnboardingSection.ProductSelect, OnboardingSection.InviteTeam, OnboardingSection.Complete]
    : [OnboardingSection.ProductSelect, OnboardingSection.Complete];
  const stepIndicator = isWorkspaceSetup ? (
    <OnboardingProgress
      currentStep={postAuthSteps.indexOf(section) + 1}
      totalSteps={postAuthSteps.length}
    />
  ) : undefined;

  return (
    <AuthPageLayout
      showFooter={false}
      headerAction={stepIndicator}
      variant={isWorkspaceSetup ? "focused" : "split"}
      contentClassName={isWorkspaceSetup ? "max-w-3xl" : undefined}
      bottomContent={section === OnboardingSection.OrgName ? <AuthTermsNotice /> : undefined}
    >
      <Helmet>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <OnboardingStepTransition step={section}>{renderView()}</OnboardingStepTransition>
    </AuthPageLayout>
  );
};
