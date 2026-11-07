import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { getSignupProduct, SignupProductType } from "@app/components/auth/signupProducts";
import {
  bindSignupTrialIntent,
  captureSignupTrialIntent,
  clearSignupTrialIntent,
  getSignupTrialProjectType
} from "@app/components/auth/signupTrialIntent";
import { ProgressSteps } from "@app/components/v4/ui/progress";
import { toast } from "@app/components/v4/ui/sonner";
import { useServerConfig } from "@app/context";
import { useSelectOrganization } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { Project, ProjectType } from "@app/hooks/api/projects/types";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

import { v4Path } from "../../links";
import { useAuthPreview } from "../preview";
import { CompleteStep } from "./CompleteStep";
import { EmailStep } from "./EmailStep";
import { InviteStep } from "./InviteStep";
import { ProductsStep } from "./ProductsStep";
import { UserInfoStep } from "./UserInfoStep";
import { VerifyCodeStep } from "./VerifyCodeStep";

enum SignupSection {
  Email = "email",
  VerifyCode = "verify",
  UserInfo = "details",
  ProductSelect = "products",
  InviteTeam = "invite",
  Complete = "complete"
}

const SECTIONS = Object.values(SignupSection) as string[];

const STEP_LABELS: Partial<Record<SignupSection, string>> = {
  [SignupSection.ProductSelect]: "Products",
  [SignupSection.InviteTeam]: "Team",
  [SignupSection.Complete]: "Done"
};

type PendingEmailVerification = { email: string; resendCooldownEndTime: number };

export type SignUpPageProps = {
  invite?: { email: string; organizationName?: string };
};

export const SignUpPage = ({ invite }: SignUpPageProps) => {
  const preview = useAuthPreview();
  const previewSection = preview === "verify-error" ? SignupSection.VerifyCode : preview;
  const isPreview = Boolean(preview);
  const isInvite = Boolean(invite);
  const [email, setEmail] = useState(invite?.email ?? (isPreview ? "ada@acme.dev" : ""));
  const [pendingEmailVerification, setPendingEmailVerification] =
    useState<PendingEmailVerification | null>(null);
  const [section, setSection] = useState<SignupSection>(() => {
    if (previewSection && SECTIONS.includes(previewSection)) return previewSection as SignupSection;
    return isInvite ? SignupSection.UserInfo : SignupSection.Email;
  });
  const [orgId, setOrgId] = useState("");
  const [inviteDraft, setInviteDraft] = useState("");
  const projectCache = useRef<Partial<Record<SignupProductType, Project>>>({});
  const [selectedProducts, setSelectedProducts] = useState<SignupProductType[]>(() => {
    if (isPreview) return [ProjectType.SecretManager, ProjectType.KMS];
    return isInvite
      ? []
      : getSignupTrialProjectType(captureSignupTrialIntent(window.location.search));
  });
  const [createdProjects, setCreatedProjects] = useState<
    Partial<Record<SignupProductType, Project>>
  >({});
  const navigate = useNavigate();
  const { callback_port: callbackPort } = useSearch({ from: "/v4/_v4-auth" });
  const { data: serverDetails } = useFetchServerStatus();
  const { config } = useServerConfig();
  const { mutateAsync: selectOrganization } = useSelectOrganization();
  const isEmailConfigured = isPreview || serverDetails?.emailConfigured;
  let previewError: string | undefined;
  if (isPreview)
    previewError = preview === "verify-error" ? "Oops! Wrong code, 2 more attempts." : "";

  useEffect(() => {
    if (!isPreview && !isInvite && !config.allowSignUp) {
      toast("Sign up is disabled");
      navigate({ to: v4Path("/login") });
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

  const handleUserInfoComplete = async (newOrgId?: string) => {
    if (newOrgId) bindSignupTrialIntent(newOrgId);
    if (isInvite) {
      clearSignupTrialIntent();
      const userOrgs = await fetchOrganizations();
      const inviteOrgId = userOrgs[0]?.id;
      if (!inviteOrgId) {
        navigate({ to: v4Path("/login") });
        return;
      }
      const { isMfaEnabled } = await selectOrganization({ organizationId: inviteOrgId });
      if (isMfaEnabled) {
        navigate({ to: v4Path("/login/select-organization"), search: { org_id: inviteOrgId } });
        return;
      }
      navigate({ to: v4Path("/organizations/$orgId/projects"), params: { orgId: inviteOrgId } });
      return;
    }

    if (callbackPort) {
      if (newOrgId) {
        navigate({
          to: v4Path("/login/select-organization"),
          search: { org_id: newOrgId, callback_port: callbackPort }
        });
      } else {
        navigate({
          to: v4Path("/organizations/onboarding"),
          search: { callback_port: callbackPort }
        });
      }
      return;
    }

    if (newOrgId) setOrgId(newOrgId);
    setSection(SignupSection.ProductSelect);
  };

  const postAuthSteps = isEmailConfigured
    ? [SignupSection.ProductSelect, SignupSection.InviteTeam, SignupSection.Complete]
    : [SignupSection.ProductSelect, SignupSection.Complete];
  const progress =
    !isInvite && postAuthSteps.includes(section) ? (
      <ProgressSteps
        label="Set up your organization"
        steps={postAuthSteps.map((step) => STEP_LABELS[step] ?? step)}
        current={postAuthSteps.indexOf(section)}
      />
    ) : undefined;

  switch (section) {
    case SignupSection.VerifyCode:
      return (
        <VerifyCodeStep
          email={email}
          onComplete={() => {
            setPendingEmailVerification(null);
            setSection(SignupSection.UserInfo);
          }}
          onChangeEmail={() => setSection(SignupSection.Email)}
          resendCooldownEndTime={pendingEmailVerification?.resendCooldownEndTime ?? 0}
          onResendCooldownChange={(resendCooldownEndTime) =>
            setPendingEmailVerification((pending) =>
              pending ? { ...pending, resendCooldownEndTime } : null
            )
          }
          callbackPort={callbackPort}
          previewError={previewError}
        />
      );
    case SignupSection.UserInfo:
      return (
        <UserInfoStep
          onComplete={handleUserInfoComplete}
          email={email}
          isInvite={isInvite}
          inviteOrganizationName={invite?.organizationName}
          isPreview={isPreview}
        />
      );
    case SignupSection.ProductSelect:
      return (
        <ProductsStep
          initialProducts={selectedProducts}
          projectCache={projectCache}
          progress={progress}
          isPreview={isPreview}
          onComplete={(products, projects) => {
            setSelectedProducts(products);
            setCreatedProjects(projects);
            setSection(
              serverDetails?.emailConfigured ? SignupSection.InviteTeam : SignupSection.Complete
            );
          }}
        />
      );
    case SignupSection.InviteTeam:
      return (
        <InviteStep
          draft={inviteDraft}
          onDraftChange={setInviteDraft}
          onBack={() => setSection(SignupSection.ProductSelect)}
          productName={
            selectedProducts.length === 1 ? getSignupProduct(selectedProducts[0])?.name : undefined
          }
          projectIds={Object.values(createdProjects).flatMap((project) =>
            project ? [project.id] : []
          )}
          grantPamAccess={selectedProducts.includes(ProjectType.PAM)}
          onComplete={() => setSection(SignupSection.Complete)}
          progress={progress}
          isPreview={isPreview}
        />
      );
    case SignupSection.Complete:
      return (
        <CompleteStep
          orgId={orgId || (localStorage.getItem("orgData.id") ?? "")}
          products={selectedProducts}
          projects={createdProjects}
          progress={progress}
        />
      );
    default:
      return (
        <EmailStep
          email={email}
          setEmail={setEmail}
          onComplete={handleEmailComplete}
          pendingVerificationEmail={pendingEmailVerification?.email}
          onResumeVerification={() => {
            if (!pendingEmailVerification) return;
            setEmail(pendingEmailVerification.email);
            setSection(SignupSection.VerifyCode);
          }}
          callbackPort={callbackPort}
          isPreview={isPreview}
        />
      );
  }
};
