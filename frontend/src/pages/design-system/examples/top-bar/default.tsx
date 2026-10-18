import { useState } from "react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Sidebar } from "@app/components/v4/ui/sidebar";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";
import { AppInset, AppShell, PageGutter, TopBar } from "@app/components/v4/ui/top-bar";

import { ExampleCell, ExampleGrid, ExampleStage } from "../../example-presentation";

const organizations = [
  { value: "acme", label: "Acme Corp", meta: "Enterprise" },
  { value: "acme-eu", label: "Acme EU", meta: "Enterprise" },
  { value: "globex", label: "Globex", meta: "Pro" }
];
const projects = [
  { value: "payments", label: "payments-api", mono: true },
  { value: "platform", label: "platform-core-services-and-shared-infrastructure", mono: true },
  { value: "web", label: "web-dashboard", mono: true }
];
const environments = [
  { value: "dev", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "prod", label: "Production" }
];
const labelOf = (options: { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

const Bar = ({ defaultProject = "payments" }: { defaultProject?: string }) => {
  const [org, setOrg] = useState("acme");
  const [project, setProject] = useState(defaultProject);
  const [environment, setEnvironment] = useState("prod");
  return (
    <TopBar
      breadcrumb={[
        {
          label: labelOf(organizations, org),
          menu: {
            label: "Switch organization",
            options: organizations,
            value: org,
            onChange: setOrg,
            actions: [{ label: "Create organization", icon: "plus" }]
          }
        },
        {
          label: labelOf(projects, project),
          mono: true,
          menu: {
            label: "Switch project",
            options: projects,
            value: project,
            onChange: setProject
          }
        },
        {
          label: labelOf(environments, environment),
          menu: {
            label: "Switch environment",
            options: environments,
            value: environment,
            onChange: setEnvironment
          }
        }
      ]}
      actions={
        <TooltipProvider>
          <Tooltip content="Search" shortcut="mod+K" side="bottom">
            <Button variant="ghost" size="icon" icon="search" iconOnly>
              Search
            </Button>
          </Tooltip>
          <Tooltip content="Notifications" side="bottom">
            <Button variant="ghost" size="icon" icon="bell" iconOnly>
              Notifications
            </Button>
          </Tooltip>
        </TooltipProvider>
      }
    />
  );
};

export default function Example() {
  const [current, setCurrent] = useState("secrets");
  return (
    <ExampleGrid width="full">
      <ExampleCell label="Beside the sidebar, crumb root on the content edge" align="stretch">
        <ExampleStage height="app">
          <AppShell>
            <Sidebar
              sections={[
                {
                  items: [
                    { id: "home", label: "Home", icon: "home" },
                    { id: "secrets", label: "Secrets", icon: "key" },
                    { id: "approvals", label: "Approvals", icon: "inbox", count: 3 }
                  ]
                }
              ]}
              current={current}
              onNavigate={(item) => setCurrent(item.id)}
              user={{ name: "Sarah Lin", email: "sarah@acme.dev" }}
            />
            <AppInset>
              <Bar />
              <PageGutter>
                <PageHeader
                  title="Secrets"
                  badges={<Badge tone="warn">Production</Badge>}
                  description="3 secrets are missing in production."
                  actions={<Button variant="primary">Add secret</Button>}
                />
              </PageGutter>
            </AppInset>
          </AppShell>
        </ExampleStage>
      </ExampleCell>
      <ExampleCell label="Without a sidebar, long project name truncates" align="stretch">
        <ExampleStage height="compact">
          <AppInset>
            <Bar defaultProject="platform" />
          </AppInset>
        </ExampleStage>
      </ExampleCell>
    </ExampleGrid>
  );
}
