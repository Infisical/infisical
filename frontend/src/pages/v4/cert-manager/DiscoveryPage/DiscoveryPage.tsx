import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  ProjectPermissionPkiCertificateInstallationActions,
  ProjectPermissionPkiDiscoveryActions
} from "@app/context/ProjectPermissionContext/types";

import { AccessRestricted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";
import { useDiscoveryAccess } from "./discovery-shared";
import { InstallationsTab } from "./installations-tab";
import { JobsTab } from "./jobs-tab";

const routeId = v4Path("/organizations/$orgId/cert-manager/discovery/");

const DISCOVERY_DOCS = "https://infisical.com/docs/documentation/platform/pki/discovery/overview";

const Page = () => {
  const { orgId } = useParams({ from: routeId });
  const { selectedTab } = useSearch({ from: routeId });
  const navigate = useNavigate();
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const access = useDiscoveryAccess(projectId ?? "");
  const { data: projectAccess, isPending: isLoadingRole } = useV4Adapter(
    "certificates"
  ).useProjectPermission({ projectId: projectId ?? "" });
  if (isResolving || (projectId && (access.isPending || isLoadingRole)))
    return <Loader size="page" label="Loading certificate discovery" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;
  const isAdmin = Boolean(
    projectAccess?.memberships.some((membership) =>
      membership.roles.some((role) => role.role === "admin")
    )
  );
  if (!isAdmin) return <AccessRestricted requirement="Cert Manager admin" />;
  const tab = selectedTab === "installations" ? "installations" : "jobs";
  const canRead =
    tab === "jobs"
      ? access.discovery(ProjectPermissionPkiDiscoveryActions.Read)
      : access.installations(ProjectPermissionPkiCertificateInstallationActions.Read);
  return (
    <Stack gap={24}>
      <PageHeader
        title="Certificate discovery"
        badges={<DocumentationLink href={DISCOVERY_DOCS} subject="Certificate discovery" />}
        tabs={
          <Tabs
            label="Certificate discovery sections"
            value={tab}
            onValueChange={(next) =>
              navigate({
                to: v4Path("/organizations/$orgId/cert-manager/discovery"),
                params: { orgId },
                search: { selectedTab: next }
              })
            }
            tabs={[
              { value: "jobs", label: "Jobs" },
              { value: "installations", label: "Installations" }
            ]}
          />
        }
      />
      {!canRead && (
        <AccessRestricted
          requirement={tab === "jobs" ? "Read discovery jobs" : "Read certificate installations"}
        />
      )}
      {canRead && tab === "jobs" && <JobsTab orgId={orgId} projectId={projectId} />}
      {canRead && tab === "installations" && (
        <InstallationsTab orgId={orgId} projectId={projectId} />
      )}
    </Stack>
  );
};

export const DiscoveryPage = () => (
  <TooltipProvider>
    <PageTitle title="Certificate Discovery" />
    <Page />
  </TooltipProvider>
);
