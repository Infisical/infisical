import { subject } from "@casl/ability";

import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";

import { useProjectPermission } from "../../../../access/permissions";
import { useV4Adapter } from "../../../../data/adapters";

export type ExternalImportSource = "vault" | "doppler";
export type ExternalImportConnections = Record<ExternalImportSource, TAvailableAppConnection[]>;

export const externalImportSources: Record<
  ExternalImportSource,
  { label: string; name: string; icon: string }
> = {
  vault: { label: "Import from HashiCorp Vault", name: "Vault", icon: "Vault.png" },
  doppler: { label: "Import from Doppler", name: "Doppler", icon: "Doppler.png" }
};

export const useExternalImports = (projectId: string, environments: string[], path: string) => {
  const adapter = useV4Adapter("secrets");
  const { permission } = useProjectPermission(projectId);
  const canCreateAt = (environment: string) =>
    permission.can(
      ProjectPermissionSecretActions.Create,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath: path,
        secretName: "*",
        secretTags: ["*"]
      })
    );
  const enabled =
    permission.can(
      ProjectPermissionAppConnectionActions.Connect,
      ProjectPermissionSub.AppConnections
    ) && canCreateAt(environments.find(canCreateAt) ?? "");
  const vault = adapter.useImportConnections(AppConnection.HCVault, projectId, { enabled }).data;
  const doppler = adapter.useImportConnections(AppConnection.Doppler, projectId, { enabled }).data;
  const connections: ExternalImportConnections = {
    vault: (enabled && vault) || [],
    doppler: (enabled && doppler) || []
  };
  return {
    connections,
    sources: (Object.keys(connections) as ExternalImportSource[]).filter(
      (source) => connections[source].length > 0
    )
  };
};
