import { useState } from "react";

import { Sidebar, type SidebarProps } from "@app/components/v4/ui/sidebar";

import { ExampleCell, ExampleGrid, ExampleStage } from "../../example-presentation";

const org: SidebarProps["sections"] = [
  {
    items: [
      { id: "home", label: "Home", icon: "home" },
      { id: "secret-management", label: "Secrets Management", icon: "key", drillIn: true },
      { id: "integrations", label: "Integrations", icon: "apps" }
    ]
  },
  {
    label: "Administration",
    items: [
      { id: "access", label: "Access control", icon: "user" },
      { id: "audit", label: "Audit logs", icon: "history" },
      { id: "settings", label: "Settings", icon: "settings" }
    ]
  }
];
const product: SidebarProps["sections"] = [
  {
    items: [
      { id: "projects", label: "Projects", icon: "folder", count: 2, drillIn: true },
      { id: "product-settings", label: "Product settings", icon: "settings" }
    ]
  }
];
const project: SidebarProps["sections"] = [
  {
    items: [
      { id: "secrets", label: "Secrets", icon: "key" },
      { id: "project-access", label: "Access control", icon: "user" },
      { id: "approvals", label: "Approvals", icon: "inbox", count: 4 }
    ]
  },
  {
    label: "Administration",
    items: [
      { id: "project-audit", label: "Audit logs", icon: "history" },
      { id: "project-settings", label: "Settings", icon: "settings" }
    ]
  }
];

type Level = "org" | "product" | "project";
const opens: Record<string, { level: Level; page: string }> = {
  "secret-management": { level: "product", page: "projects" },
  projects: { level: "project", page: "secrets" }
};
const up: Record<Level, { level: Level; page: string }> = {
  org: { level: "org", page: "home" },
  product: { level: "org", page: "secret-management" },
  project: { level: "product", page: "projects" }
};

const Scoped = ({ start, collapsed }: { start: Level; collapsed?: boolean }) => {
  const [at, setAt] = useState<{ level: Level; page: string }>(
    start === "org" ? up.org : { level: start, page: start === "product" ? "projects" : "secrets" }
  );
  const scope =
    at.level === "org"
      ? undefined
      : {
          id: at.level,
          back: {
            id: "back",
            label: at.level === "project" ? "Secrets Management" : "Acme Corp"
          },
          sections: at.level === "project" ? project : product
        };
  return (
    <Sidebar
      sections={org}
      scope={scope}
      current={at.page}
      defaultCollapsed={collapsed}
      onNavigate={(item) =>
        setAt(item.id === "back" ? up[at.level] : (opens[item.id] ?? { ...at, page: item.id }))
      }
    />
  );
};

export default function Example() {
  return (
    <ExampleGrid>
      <ExampleCell label="Top level" align="stretch">
        <ExampleStage height="app">
          <Scoped start="org" />
        </ExampleStage>
      </ExampleCell>
      <ExampleCell label="Project scope with a back row" align="stretch">
        <ExampleStage height="app">
          <Scoped start="project" />
        </ExampleStage>
      </ExampleCell>
      <ExampleCell label="Project scope in the rail" align="stretch">
        <ExampleStage height="app">
          <Scoped start="project" collapsed />
        </ExampleStage>
      </ExampleCell>
    </ExampleGrid>
  );
}
