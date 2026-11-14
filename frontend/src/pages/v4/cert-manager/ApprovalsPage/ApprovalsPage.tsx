import { Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { v4Path } from "../../links";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";
import { PoliciesTab } from "./policies-tab";
import { RequestsTab } from "./requests-tab";

const routeId = v4Path("/organizations/$orgId/cert-manager/approvals/");

export const ApprovalsPage = () => {
  const { orgId } = useParams({ from: routeId });
  const { selectedTab } = useSearch({ from: routeId });
  const navigate = useNavigate();
  const { projectId, isPending } = useCertManagerProjectId(orgId);
  if (isPending) return <Loader size="page" label="Loading certificate approvals" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;
  const tab = selectedTab === "policies" ? "policies" : "requests";
  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Certificate approvals"
          tabs={
            <Tabs
              label="Certificate approval sections"
              value={tab}
              onValueChange={(next) =>
                navigate({
                  to: v4Path("/organizations/$orgId/cert-manager/approvals"),
                  params: { orgId },
                  search: { selectedTab: next }
                })
              }
              tabs={[
                { value: "requests", label: "Requests" },
                { value: "policies", label: "Policies" }
              ]}
            />
          }
        />
        {tab === "requests" ? (
          <RequestsTab orgId={orgId} projectId={projectId} />
        ) : (
          <PoliciesTab projectId={projectId} />
        )}
      </Stack>
    </TooltipProvider>
  );
};
