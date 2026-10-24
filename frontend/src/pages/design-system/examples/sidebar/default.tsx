import { useState } from "react";

import { Sidebar, type SidebarProps, type SidebarTheme } from "@app/components/v4/ui/sidebar";

import { ExampleCell, ExampleGrid, ExampleStage } from "../../example-presentation";

const spaces: SidebarProps["spaces"] = [
  {
    id: "home",
    label: "Home",
    icon: "apps",
    sections: [
      {
        items: [
          { id: "home", label: "Home", icon: "home" },
          { id: "inbox", label: "Needs you", icon: "inbox", count: 4 }
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
              { id: "secrets-overview", label: "Overview" },
              { id: "secrets-integrations", label: "Integrations" },
              { id: "secrets-rotation", label: "Rotation" },
              { id: "secrets-approvals", label: "Approvals", count: 2 },
              { id: "secrets-scanning", label: "Secret scanning", count: 1 }
            ]
          },
          { id: "certificates", label: "Certificates", icon: "cert" },
          { id: "pam", label: "PAM", icon: "terminal" },
          { id: "kms", label: "KMS", icon: "lock" }
        ]
      }
    ]
  },
  {
    id: "org",
    label: "Organization",
    icon: "building",
    sections: [
      {
        items: [
          { id: "integrations", label: "Integrations", icon: "link" },
          {
            id: "access",
            label: "Access",
            icon: "user",
            children: [
              { id: "access-members", label: "Members" },
              { id: "access-identities", label: "Machine identities" },
              { id: "access-roles", label: "Roles" }
            ]
          },
          { id: "audit", label: "Audit logs", icon: "history" },
          { id: "billing", label: "Billing", icon: "file" },
          { id: "settings", label: "Settings", icon: "settings" }
        ]
      }
    ]
  }
];

const organizations = [
  { value: "acme", label: "Acme Corp", plan: "Enterprise" },
  { value: "globex", label: "Globex", plan: "Pro" },
  { value: "initech", label: "Initech", plan: "Free" }
];

const Shell = ({ start, defaultCollapsed }: { start: string; defaultCollapsed?: boolean }) => {
  const [current, setCurrent] = useState(start);
  const [org, setOrg] = useState("acme");
  const [unseen, setUnseen] = useState(3);
  const [theme, setTheme] = useState<SidebarTheme>("system");
  return (
    <Sidebar
      spaces={spaces}
      current={current}
      onNavigate={(item) => setCurrent(item.id)}
      defaultCollapsed={defaultCollapsed}
      search={{ onClick: () => setCurrent("home") }}
      invite={{ onClick: () => setCurrent("access-members") }}
      footerItems={[
        {
          id: "news",
          label: "What's new",
          icon: "megaphone",
          count: unseen,
          onClick: () => setUnseen(0)
        },
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
    <ExampleGrid>
      <ExampleCell label="Expanded, a child page current" align="stretch">
        <ExampleStage height="app">
          <Shell start="secrets-overview" />
        </ExampleStage>
      </ExampleCell>
      <ExampleCell label="Rail, counts as dots" align="stretch">
        <ExampleStage height="app">
          <Shell start="secrets-approvals" defaultCollapsed />
        </ExampleStage>
      </ExampleCell>
    </ExampleGrid>
  );
}
