import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { getSignupProduct, SignupProductType } from "@app/components/auth/signupProducts";
import {
  bindSignupTrialIntent,
  getSignupTrialIntent,
  getSignupTrialProjectType
} from "@app/components/auth/signupTrialIntent";
import { Loader } from "@app/components/v4/ui/loader";
import { ProgressSteps } from "@app/components/v4/ui/progress";
import { Toaster } from "@app/components/v4/ui/sonner";
import { useSelectOrganization } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { Project, ProjectType } from "@app/hooks/api/projects/types";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

import { CompleteStep } from "../SignUpPage/CompleteStep";
import { InviteStep } from "../SignUpPage/InviteStep";
import { ProductsStep } from "../SignUpPage/ProductsStep";
import { OrgNameStep } from "./OrgNameStep";

enum OnboardingSection {
  Loading = "loading",
  OrgName = "org-name",
  ProductSelect = "products",
  InviteTeam = "invite",
  Complete = "complete"
}

const STEP_LABELS: Partial<Record<OnboardingSection, string>> = {
  [OnboardingSection.ProductSelect]: "Products",
  [OnboardingSection.InviteTeam]: "Team",
  [OnboardingSection.Complete]: "Done"
};

export const OrgOnboardingPage = () => {
  const navigate = useNavigate();
  const { callback_port: callbackPort, preview } = useSearch({
    from: "/v4/organizations/onboarding"
  });
  const { data: serverDetails } = useFetchServerStatus();
  const { mutateAsync: selectOrganization } = useSelectOrganization();
  const [section, setSection] = useState<OnboardingSection>(
    preview ? OnboardingSection.OrgName : OnboardingSection.Loading
  );
  const [orgId, setOrgId] = useState("");
  const [inviteDraft, setInviteDraft] = useState("");
  const projectCache = useRef<Partial<Record<SignupProductType, Project>>>({});
  const [selectedProducts, setSelectedProducts] = useState<SignupProductType[]>(() =>
    getSignupTrialProjectType(getSignupTrialIntent())
  );
  const [createdProjects, setCreatedProjects] = useState<
    Partial<Record<SignupProductType, Project>>
  >({});

  const handOffToCli = (targetOrgId: string) =>
    navigate({
      to: "/v4/login/select-organization",
      search: { org_id: targetOrgId, callback_port: callbackPort }
    });

  const hasRun = useRef(false);

  useEffect(() => {
    if (preview || hasRun.current) return;
    hasRun.current = true;

    const resolveEntrySection = async () => {
      try {
        const orgs = await fetchOrganizations();
        if (orgs.length === 0) {
          setSection(OnboardingSection.OrgName);
          return;
        }
        const existingOrgId = orgs[0].id;
        bindSignupTrialIntent(existingOrgId);
        if (callbackPort) {
          handOffToCli(existingOrgId);
          return;
        }
        const { isMfaEnabled } = await selectOrganization({ organizationId: existingOrgId });
        if (isMfaEnabled) {
          navigate({ to: "/v4/login/select-organization", search: { org_id: existingOrgId } });
          return;
        }
        localStorage.setItem("orgData.id", existingOrgId);
        setOrgId(existingOrgId);
        setSection(OnboardingSection.ProductSelect);
      } catch {
        navigate({ to: "/v4/login/select-organization" });
      }
    };

    resolveEntrySection();
  }, [selectOrganization, navigate]);

  const postAuthSteps = serverDetails?.emailConfigured
    ? [OnboardingSection.ProductSelect, OnboardingSection.InviteTeam, OnboardingSection.Complete]
    : [OnboardingSection.ProductSelect, OnboardingSection.Complete];
  const progress = postAuthSteps.includes(section) ? (
    <ProgressSteps
      label="Set up your organization"
      steps={postAuthSteps.map((step) => STEP_LABELS[step] ?? step)}
      current={postAuthSteps.indexOf(section)}
    />
  ) : undefined;

  const renderView = () => {
    switch (section) {
      case OnboardingSection.OrgName:
        return (
          <OrgNameStep
            callbackPort={callbackPort}
            isPreview={Boolean(preview)}
            onComplete={(newOrgId) => {
              bindSignupTrialIntent(newOrgId);
              if (callbackPort) {
                handOffToCli(newOrgId);
                return;
              }
              setOrgId(newOrgId);
              setSection(OnboardingSection.ProductSelect);
            }}
          />
        );
      case OnboardingSection.ProductSelect:
        return (
          <ProductsStep
            initialProducts={selectedProducts}
            projectCache={projectCache}
            progress={progress}
            onComplete={(products, projects) => {
              setSelectedProducts(products);
              setCreatedProjects(projects);
              setSection(
                serverDetails?.emailConfigured
                  ? OnboardingSection.InviteTeam
                  : OnboardingSection.Complete
              );
            }}
          />
        );
      case OnboardingSection.InviteTeam:
        return (
          <InviteStep
            draft={inviteDraft}
            onDraftChange={setInviteDraft}
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
            onComplete={() => setSection(OnboardingSection.Complete)}
            progress={progress}
          />
        );
      case OnboardingSection.Complete:
        return (
          <CompleteStep
            orgId={orgId}
            products={selectedProducts}
            projects={createdProjects}
            progress={progress}
          />
        );
      default:
        return <Loader size="page" label="Loading your account" className="flex-1" />;
    }
  };

  return (
    <>
      {renderView()}
      <Toaster />
    </>
  );
};
