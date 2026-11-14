import { Loader } from "@infisical/cipher/ui/loader";
import { useParams, useSearch } from "@tanstack/react-router";

import {
  ProjectPermissionActions,
  ProjectPermissionAppConnectionActions,
  ProjectPermissionHsmConnectorActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { orgHref } from "../../links";
import { ProjectSettingsLayout, type ProjectSettingsTab } from "../../project/SettingsPage/layout";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";
import { AlertsTab } from "./alerts";
import { AppConnectionsTab } from "./app-connections";
import { CleanupTab } from "./cleanup";
import { HsmConnectorsTab } from "./hsm-connectors";
import { PermissionGuard } from "./shared";

const AppConnectionsBody = () => (
  <PermissionGuard
    requirement="read App Connections"
    allowed={(permission) =>
      permission.can(
        ProjectPermissionAppConnectionActions.Read,
        ProjectPermissionSub.AppConnections
      )
    }
  >
    <AppConnectionsTab />
  </PermissionGuard>
);

const HsmConnectorsBody = () => (
  <PermissionGuard
    requirement="read HSM Connectors"
    allowed={(permission) =>
      permission.can(ProjectPermissionHsmConnectorActions.Read, ProjectPermissionSub.HsmConnectors)
    }
  >
    <HsmConnectorsTab />
  </PermissionGuard>
);

const AlertsBody = () => (
  <PermissionGuard
    requirement="read Alerts"
    allowed={(permission) =>
      permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.PkiAlerts)
    }
  >
    <AlertsTab />
  </PermissionGuard>
);

const tabs: ProjectSettingsTab[] = [
  { key: "app-connections", name: "App connections", Body: AppConnectionsBody },
  { key: "hsm-connectors", name: "HSM connectors", Body: HsmConnectorsBody },
  { key: "cleanup", name: "Cleanup", Body: CleanupTab },
  { key: "alerts", name: "Alerts", Body: AlertsBody }
];

export const SettingsPage = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/cert-manager/settings" });
  const { selectedTab } = useSearch({ from: "/v4/organizations/$orgId/cert-manager/settings" });
  const { projectId, isPending } = useCertManagerProjectId(orgId);
  if (isPending) return <Loader size="page" label="Loading settings" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;
  return (
    <ProjectSettingsLayout
      tabs={tabs}
      selectedTab={selectedTab}
      generalHref={orgHref(orgId, "/cert-manager/settings")}
    />
  );
};
