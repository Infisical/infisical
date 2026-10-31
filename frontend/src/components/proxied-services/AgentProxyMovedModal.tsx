import { ArrowRightIcon, CheckIcon, VaultIcon } from "lucide-react";

import { useEnterAgentVault } from "@app/components/agent-vault/useEnterAgentVault";
import { UpgradeDialogLayout } from "@app/components/license/UpgradeGate/UpgradeDialogLayout";
import { Button, DocumentationLinkBadge } from "@app/components/v3";
import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

const CHANGES = [
  {
    title: "Access Bundles Replace Proxied Services",
    description:
      "Describe the services an agent may reach in an access bundle, then grant it to the people who run agents."
  },
  {
    title: "Credentials Stay Out of Agents",
    description:
      "A proxy in your network attaches the real credential on the way out, only for the services you allowed."
  },
  {
    title: "Existing Proxied Services Keep Working",
    description:
      "You can still edit and delete the proxied services in this project, but you cannot create new ones. Proxied Services will be removed in the future, and we recommend you migrate to Agent Vault for securing agentic access to your secrets"
  }
];

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const AgentProxyMovedModal = ({ isOpen, onOpenChange }: Props) => {
  const {
    enterAgentVault,
    requestAgentVaultAccess,
    needsAccessRequest,
    isEntering,
    agentVaultAccessRequest
  } = useEnterAgentVault();

  return (
    <>
      {isOpen && (
        <UpgradeDialogLayout
          scopeName="Agent Vault"
          icon={
            <div className="flex size-16 items-center justify-center rounded-md border border-product-av/30 bg-gradient-to-br from-product-av/20 to-product-av/5">
              <VaultIcon className="size-8 text-product-av" />
            </div>
          }
          title="Agent Proxy Is Moving to Agent Vault"
          description="Set up agent access to external services in Agent Vault."
          onOpenChange={onOpenChange}
          footer={
            <Button
              data-upgrade-cta
              variant="av"
              className="w-full"
              isPending={isEntering}
              onClick={async () => {
                if (needsAccessRequest) {
                  if (await requestAgentVaultAccess()) onOpenChange(false);
                  return;
                }
                // A toast explains a blocked entry, so the notice stays open behind it.
                const outcome = await enterAgentVault();
                if (outcome !== "blocked") onOpenChange(false);
              }}
            >
              {needsAccessRequest ? (
                "Request Access"
              ) : (
                <>
                  Go to Agent Vault
                  <ArrowRightIcon />
                </>
              )}
            </Button>
          }
        >
          <section aria-label="What is changing" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-normal">What Is Changing</h3>
              <DocumentationLinkBadge href={AgentVaultDocsUrls.overview} />
            </div>
            <ul className="flex flex-col gap-4">
              {CHANGES.map(({ title, description }) => (
                <li key={title} className="flex items-start gap-3">
                  <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  <div className="text-sm">
                    <p className="font-medium">{title}</p>
                    <p className="mt-1 text-muted">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </UpgradeDialogLayout>
      )}
      {agentVaultAccessRequest}
    </>
  );
};
