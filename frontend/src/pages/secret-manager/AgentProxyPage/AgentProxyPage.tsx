import { Helmet } from "react-helmet";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { ProjectType } from "@app/hooks/api/projects/types";

import { AgentPoliciesTab } from "./components/AgentPoliciesTab";
import { UserPoliciesTab } from "./components/UserPoliciesTab";

const TABS = [
  { key: "agent-policies", label: "Agent Policies", component: AgentPoliciesTab },
  { key: "user-policies", label: "User Policies", component: UserPoliciesTab }
];

export const AgentProxyPage = withProjectPermission(
  () => {
    const navigate = useNavigate();
    const { currentProject } = useProject();
    const selectedTab = useSearch({
      from: ROUTE_PATHS.SecretManager.AgentProxyPage.id,
      select: (search) => search.selectedTab
    });

    return (
      <>
        <Helmet>
          <title>Agent Proxy</title>
        </Helmet>
        <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
          <div className="mx-auto mb-6 w-full max-w-7xl">
            <PageHeader
              scope={ProjectType.SecretManager}
              title="Agent Proxy"
              description="Agents get their own policies, people get theirs, and a request has to pass both."
            />
            <Tabs
              value={selectedTab}
              onValueChange={(tab) =>
                navigate({
                  to: ROUTE_PATHS.SecretManager.AgentProxyPage.path,
                  params: {
                    orgId: currentProject.orgId,
                    projectId: currentProject.id
                  },
                  search: { selectedTab: tab }
                })
              }
            >
              <TabsList variant="project">
                {TABS.map(({ key, label }) => (
                  <TabsTrigger value={key} key={`tab-${key}`}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {TABS.map(({ key, component: Component }) => (
                <TabsContent value={key} key={`tab-panel-${key}`}>
                  <Component />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
      </>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.AgentPolicies }
);
