import { Plus } from "lucide-react";

import { Button, DocumentationLinkBadge } from "@app/components/v3";
import { useOrgPermission } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";

import { InPlatformMigrationSection } from "./components/InPlatformMigrationSection";
import { SelectImportFromPlatformModal } from "./components/SelectImportFromPlatformModal";

const EXTERNAL_MIGRATIONS_DOCS_HREF =
  "https://infisical.com/docs/documentation/platform/external-migrations/overview";

export const ExternalMigrationsTab = () => {
  const { hasOrgRole } = useOrgPermission();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["selectImportPlatform"] as const);

  return (
    <div className="flex flex-col gap-6">
      {/* In-Platform Migration Tooling Section */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-medium text-foreground">In-Platform Migration Tooling</h2>
            <DocumentationLinkBadge href={EXTERNAL_MIGRATIONS_DOCS_HREF} />
          </div>
          <p className="mt-1 mb-6 text-sm text-muted">
            Connect <span className="text-foreground/90">HashiCorp Vault</span> or{" "}
            <span className="text-foreground/90">Doppler</span> to enable migration features across
            Infisical: import KV secrets (and from Vault, policies, Kubernetes-related resources, and
            more) directly from the UI.
          </p>
        </div>
        <InPlatformMigrationSection />
      </div>

      {/* Bulk Data Import Section */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4">
          <h2 className="text-xl font-medium text-foreground">Bulk Data Import</h2>
          <p className="mt-1 mb-6 text-sm text-muted">
            Perform one-time bulk imports of data from external platforms.
          </p>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-base font-medium text-foreground">Import from external source</p>
              <DocumentationLinkBadge href={EXTERNAL_MIGRATIONS_DOCS_HREF} />
            </div>
            <p className="mt-1 text-sm text-muted">Import data from another platform to Infisical.</p>
          </div>

          <Button
            variant="project"
            type="button"
            className="gap-1.5"
            onClick={() => {
              handlePopUpOpen("selectImportPlatform");
            }}
            isDisabled={!hasOrgRole(OrgMembershipRole.Admin)}
          >
            <Plus className="size-4 shrink-0" />
            Import
          </Button>
        </div>

        <SelectImportFromPlatformModal
          isOpen={popUp.selectImportPlatform.isOpen}
          onToggle={(state) => handlePopUpToggle("selectImportPlatform", state)}
        />
      </div>
    </div>
  );
};
