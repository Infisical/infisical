import { useState } from "react";
import { Helmet } from "react-helmet";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";
import { BanIcon, PlayIcon } from "lucide-react";

import { Button, UnstableEmpty, UnstableEmptyHeader, UnstableEmptyTitle } from "@app/components/v3";
import { useOrganization } from "@app/context";

import { MOCK_ROTATION_POLICIES, ROTATION_POLICY_TYPE_MAP } from "../PamRotationsPage/mock-data";
import { EditMatchingRulesSheet } from "./components/EditMatchingRulesSheet";
import { RotationCredentialsSection } from "./components/RotationCredentialsSection";
import { RotationDetailsSection } from "./components/RotationDetailsSection";
import { RotationMatchingSection } from "./components/RotationMatchingSection";
import { RotationRunsTable } from "./components/RotationRunsTable";

const PageContent = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const params = useParams({ strict: false }) as {
    rotationPolicyId?: string;
    projectId?: string;
  };

  const { rotationPolicyId, projectId } = params;

  const [isMatchingSheetOpen, setIsMatchingSheetOpen] = useState(false);

  const policy = MOCK_ROTATION_POLICIES.find((p) => p.id === rotationPolicyId);

  if (!policy) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <UnstableEmpty className="max-w-2xl">
          <UnstableEmptyHeader>
            <BanIcon className="size-8 text-muted" />
            <UnstableEmptyTitle className="text-muted">
              Could not find rotation policy with ID {rotationPolicyId}
            </UnstableEmptyTitle>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      </div>
    );
  }

  const typeInfo = ROTATION_POLICY_TYPE_MAP[policy.type];

  const handleBack = () => {
    navigate({
      to: "/organizations/$orgId/projects/pam/$projectId/rotations",
      params: { orgId: currentOrg.id, projectId: projectId! }
    });
  };

  return (
    <div className="container mx-auto flex max-w-7xl flex-col px-6 py-6 text-mineshaft-50">
      <button
        type="button"
        onClick={handleBack}
        className="mb-4 flex items-center gap-1 text-sm text-bunker-300 hover:text-primary-400"
      >
        <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
        Rotation Policies
      </button>

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-mineshaft-700">
            <img
              alt={typeInfo.name}
              src={`/images/integrations/${typeInfo.image}`}
              className="size-6"
            />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-mineshaft-100">{policy.name}</h1>
            <p className="text-sm text-bunker-300">{typeInfo.name} Rotation Policy</p>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left Column */}
        <div className="flex w-80 shrink-0 flex-col gap-4">
          <RotationDetailsSection policy={policy} />
          <RotationCredentialsSection policy={policy} />
          <RotationMatchingSection policy={policy} onEdit={() => setIsMatchingSheetOpen(true)} />
        </div>

        {/* Right Column - Runs */}
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-medium">Runs</h3>
            <Button variant="neutral" size="sm">
              <PlayIcon className="size-4" />
              Trigger Rotation
            </Button>
          </div>
          <RotationRunsTable runs={policy.runs} />
        </div>
      </div>

      <EditMatchingRulesSheet
        isOpen={isMatchingSheetOpen}
        onOpenChange={setIsMatchingSheetOpen}
        policy={policy}
      />
    </div>
  );
};

export const PamRotationByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>Rotation Policy | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageContent />
    </>
  );
};
