import { useState } from "react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Sidebar } from "@app/components/v4/ui/sidebar";
import {
  AppInset,
  AppShell,
  PageGutter,
  type ShellTheme,
  TopBar
} from "@app/components/v4/ui/top-bar";

import { ExampleCell, ExampleGrid, ExampleStage } from "../../example-presentation";

const organizations = [
  { value: "acme", label: "Acme Corp", group: "Current organization" },
  { value: "acme-eu", label: "acme-eu", group: "Sub-organizations" },
  { value: "globex", label: "Globex", group: "Other organizations" }
];
const projects = [
  { value: "payments", label: "payments-api" },
  { value: "platform", label: "platform-core-services-and-shared-infrastructure" },
  { value: "web", label: "web-dashboard" }
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
  const [theme, setTheme] = useState<ShellTheme>("system");
  return (
    <TopBar
      breadcrumb={[
        {
          label: labelOf(organizations, org),
          href: "#top-bar",
          media: <Icon name="building" />,
          switcher: {
            label: "Switch organization",
            searchable: true,
            placeholder: "Search organizations",
            options: organizations,
            value: org,
            onChange: setOrg,
            actions: [{ label: "Organization settings", icon: "settings" }]
          }
        },
        {
          label: labelOf(projects, project),
          href: "#top-bar",
          switcher: {
            label: "Switch project",
            options: projects,
            value: project,
            onChange: setProject
          }
        },
        {
          label: labelOf(environments, environment),
          switcher: {
            label: "Switch environment",
            options: environments,
            value: environment,
            onChange: setEnvironment
          }
        }
      ]}
      notifications={{ unread: 2 }}
      search={{ onClick: () => {} }}
      account={{
        name: "Sarah Lin",
        email: "sarah@acme.dev",
        items: [
          { label: "Personal settings", icon: "user" },
          { label: "Invite users", icon: "user-plus" }
        ],
        theme: { value: theme, onChange: setTheme },
        endItems: [
          { label: "Copy token", icon: "copy" },
          { type: "separator" },
          { label: "Log out" }
        ]
      }}
    />
  );
};

export default function Example() {
  const [current, setCurrent] = useState("secrets");
  return (
    <ExampleGrid width="full">
      <ExampleCell
        label="Beside the sidebar, organization switcher over the sidebar"
        align="stretch"
      >
        <ExampleStage height="app">
          <AppShell>
            <Bar />
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
            />
            <AppInset>
              <PageGutter>
                <PageHeader
                  title="Secrets"
                  badges={<Badge tone="warn">Production</Badge>}
                  description="3 secrets are missing in production."
                  actions={<Button variant="accent">Add secret</Button>}
                />
              </PageGutter>
            </AppInset>
          </AppShell>
        </ExampleStage>
      </ExampleCell>
      <ExampleCell label="Without a sidebar, long project name truncates" align="stretch">
        <ExampleStage height="compact">
          <AppShell>
            <Bar defaultProject="platform" />
            <AppInset />
          </AppShell>
        </ExampleStage>
      </ExampleCell>
    </ExampleGrid>
  );
}
