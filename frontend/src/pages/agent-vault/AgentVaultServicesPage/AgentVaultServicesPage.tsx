import { useState } from "react";
import { NetworkIcon } from "lucide-react";

import { PersonalValuesDialog } from "@app/components/agent-vault/PersonalValuesDialog";
import { ServiceSheet } from "@app/components/agent-vault/service-sheet";
import { ServicesCard } from "@app/components/agent-vault/ServicesCard";
import { PageTitle } from "@app/components/PageTitle";
import { AccessRestrictedDialog, PageHeader, PageLoader } from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import { useListAgentVaultServices } from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

// The API's page limit. The card searches and sorts what it holds, so a project past it shows the first page.
const SERVICES_LIMIT = 100;

const ServicesContent = () => {
  const { projectId } = useProject();
  const { data, isPending } = useListAgentVaultServices(projectId, { limit: SERVICES_LIMIT });
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [serviceToEdit, setServiceToEdit] = useState<TAgentVaultService | null>(null);
  const [serviceToSetUp, setServiceToSetUp] = useState<TAgentVaultService | null>(null);

  if (isPending) return <PageLoader />;

  return (
    <>
      <ServicesCard
        services={data?.services ?? []}
        canManage
        onAdd={() => {
          setServiceToEdit(null);
          setIsSheetOpen(true);
        }}
        onEdit={(service) => {
          setServiceToEdit(service);
          setIsSheetOpen(true);
        }}
        onSetUp={setServiceToSetUp}
      />

      <ServiceSheet isOpen={isSheetOpen} onOpenChange={setIsSheetOpen} service={serviceToEdit} />

      <PersonalValuesDialog
        target={serviceToSetUp ? { service: serviceToSetUp } : null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setServiceToSetUp(null);
        }}
      />
    </>
  );
};

export const AgentVaultServicesPage = () => {
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <PageTitle title="Services" />

      <PageHeader
        scope={ProjectType.AgentVault}
        icon={NetworkIcon}
        title="Services"
        description="Define each API, MCP server, database and SSH server once, then add it to the access bundles that need it."
      />
      {isAdmin ? <ServicesContent /> : <AccessRestrictedDialog />}
    </div>
  );
};
