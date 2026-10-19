import { useState } from "react";

import { Sidebar, type SidebarProps, type SidebarTheme } from "@app/components/v4/ui/sidebar";

import { ExampleCell, ExampleGrid, ExampleStage } from "../../example-presentation";

const sections: SidebarProps["sections"] = [
  {
    items: [
      { id: "home", label: "Home", icon: "home" },
      { id: "approvals", label: "Approvals", icon: "inbox", count: 3 }
    ]
  },
  {
    label: "Products",
    items: [
      {
        id: "secrets",
        label: "Secrets",
        icon: "key",
        children: [
          { id: "projects", label: "Projects", icon: "folder" },
          { id: "syncs", label: "Secret syncs", icon: "sync", count: 2 }
        ]
      },
      { id: "certificates", label: "Certificates", icon: "cert" },
      { id: "kms", label: "KMS", icon: "lock" },
      { id: "pam", label: "Access manager", icon: "terminal" }
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

const organizations = [
  { value: "acme", label: "Acme Corp", plan: "Enterprise" },
  { value: "acme-eu", label: "Acme EU", plan: "Enterprise" },
  { value: "globex", label: "Globex", plan: "Pro" }
];

const Shell = ({ defaultCollapsed }: { defaultCollapsed?: boolean }) => {
  const [current, setCurrent] = useState("projects");
  const [org, setOrg] = useState("acme");
  const [theme, setTheme] = useState<SidebarTheme>("system");
  return (
    <Sidebar
      label="Main"
      sections={sections}
      current={current}
      onNavigate={(item) => setCurrent(item.id)}
      defaultCollapsed={defaultCollapsed}
      search={{ onClick: () => setCurrent("home") }}
      invite={{ onClick: () => setCurrent("access") }}
      footerItems={[
        { id: "news", label: "What's new", icon: "megaphone", count: 2 },
        { id: "docs", label: "Docs", icon: "file", href: "#sidebar", external: true }
      ]}
      user={{
        name: "Sarah Lin",
        email: "sarah@acme.dev",
        items: [{ label: "Sign out" }],
        onClick: () => setCurrent("settings")
      }}
      org={{
        name: organizations.find((option) => option.value === org)?.label ?? "Acme Corp",
        options: organizations,
        value: org,
        onChange: setOrg,
        actions: [{ label: "Create organization", icon: "plus" }]
      }}
      theme={{ value: theme, onChange: setTheme }}
    />
  );
};

export default function Example() {
  return (
    <ExampleGrid width="full">
      <ExampleCell label="Expanded, a child page current" align="stretch">
        <ExampleStage height="app">
          <Shell />
        </ExampleStage>
      </ExampleCell>
      <ExampleCell label="Rail, counts as dots" align="stretch">
        <ExampleStage height="app">
          <Shell defaultCollapsed />
        </ExampleStage>
      </ExampleCell>
    </ExampleGrid>
  );
}
