import { Button } from "@infisical/cipher/ui/button";
import { Icon } from "@infisical/cipher/ui/icon";
import { Vault } from "lucide-react";

import { ProjectType } from "@app/hooks/api/projects/types";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

import { useV4Mode } from "../../../data/adapters";
import { PlanFeatureList } from "../../../license/ProductUpgradeDialog";
import { UpgradeDialogLayout } from "../../../license/UpgradeDialogLayout";
import { orgHref, useGo } from "../../../links";
import { productHome, productOf } from "../../../shell/navigation";

const AGENT_VAULT_DOCS_URL =
  "https://infisical.com/docs/documentation/platform/agent-vault/overview";

const CHANGES = [
  {
    label: "Access bundles replace proxied services",
    description:
      "Describe the services an agent may reach in an access bundle, then grant it to the people who run agents."
  },
  {
    label: "Existing proxied services keep working",
    description:
      "You can still edit and delete this project's proxied services, but you can't create new ones. They'll be removed in a future release."
  }
];

export function AgentProxyMovedDialog({
  orgId,
  projectId,
  onOpenChange
}: {
  orgId: string;
  projectId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const go = useGo();
  const mode = useV4Mode();
  const goToAgentVault = () => {
    if (mode !== "demo")
      analytics.captureForOrganization(AnalyticsEvent.AgentVaultRedirectClicked, orgId, {
        projectId,
        source: "agent-proxy-moved-modal",
        action: "go-to-agent-vault"
      });
    onOpenChange(false);
    go(orgHref(orgId, productHome(productOf(ProjectType.AgentVault))));
  };
  return (
    <UpgradeDialogLayout
      scopeName="Agent Vault"
      icon={<Icon icon={Vault} size={32} />}
      title="Agent Proxy is moving to Agent Vault"
      onOpenChange={onOpenChange}
      footer={
        <Button variant="primary" className="w-full" onClick={goToAgentVault}>
          Go to Agent Vault
        </Button>
      }
    >
      <section aria-label="What is changing">
        <PlanFeatureList features={CHANGES} />
      </section>
      <Button asChild variant="ghost" size="xs" iconRight="external" className="self-start">
        <a href={AGENT_VAULT_DOCS_URL} target="_blank" rel="noopener noreferrer">
          Docs
        </a>
      </Button>
    </UpgradeDialogLayout>
  );
}
