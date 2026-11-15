import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Inline } from "@infisical/cipher/ui/layout";
import { List, ListRow } from "@infisical/cipher/ui/list";

import { ExternalMigrationProviders } from "@app/hooks/api/migration/types";

import { useOrgId } from "../../access/permissions";
import { ProviderIcon } from "../../components/provider-icon";
import { useV4Adapter } from "../../data/adapters";
import { EnvKeyImportSheet, VaultImportSheet } from "./migration-sheets";

const MIGRATIONS_DOCS =
  "https://infisical.com/docs/documentation/platform/external-migrations/overview";

type Source = ExternalMigrationProviders.Vault | ExternalMigrationProviders.EnvKey;

const SOURCES: { id: Source; title: string; icon: string; description: string }[] = [
  {
    id: ExternalMigrationProviders.Vault,
    title: "HCP Vault",
    icon: "Vault.png",
    description: "Import key vaults or namespaces as projects and environments"
  },
  {
    id: ExternalMigrationProviders.EnvKey,
    title: "EnvKey",
    icon: "EnvKey.png",
    description: "Import apps, environments and secrets from an export"
  }
];

export const ExternalMigrationsTab = () => {
  const orgId = useOrgId();
  const { data: isAdmin, isPending } = useV4Adapter("integrations").useIsOrgAdmin(orgId);
  const [source, setSource] = useState<Source>();
  const close = () => setSource(undefined);
  return (
    <>
      <List
        label="Migration sources"
        title={
          <Inline gap={8} align="center">
            Import from another secret manager
            <DocumentationLink href={MIGRATIONS_DOCS} subject="external migrations" />
          </Inline>
        }
      >
        {SOURCES.map(({ id, title, icon, description }) => (
          <ListRow
            key={id}
            value={id}
            label={title}
            title={title}
            description={description}
            media={<ProviderIcon icon={icon} alt="" />}
            actions={
              <Button
                variant="outline"
                loading={isPending}
                disabledReason={
                  isPending || isAdmin ? undefined : "Only organization admins can import data"
                }
                onClick={() => setSource(id)}
              >
                Import
              </Button>
            }
          />
        ))}
      </List>
      {source === ExternalMigrationProviders.Vault && <VaultImportSheet onClose={close} />}
      {source === ExternalMigrationProviders.EnvKey && <EnvKeyImportSheet onClose={close} />}
    </>
  );
};
