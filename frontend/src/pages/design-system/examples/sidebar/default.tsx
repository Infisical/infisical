import { useState } from "react";

import { Sidebar, type SidebarProps } from "@app/components/v4/ui/sidebar";

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

const Shell = ({ start, defaultCollapsed }: { start: string; defaultCollapsed?: boolean }) => {
  const [current, setCurrent] = useState(start);
  const [unseen, setUnseen] = useState(2);
  return (
    <Sidebar
      spaces={spaces}
      current={current}
      onNavigate={(item) => setCurrent(item.id)}
      defaultCollapsed={defaultCollapsed}
      announcements={{ unread: unseen, onClick: () => setUnseen(0) }}
      help={{
        status: { label: "All systems operational", href: "#sidebar" },
        whatsNew: { unread: unseen, latest: "Oct 30", onSelect: () => setUnseen(0) },
        items: [
          { label: "Read Docs", href: "#sidebar", external: true },
          { label: "Email Support", href: "mailto:support@infisical.com" }
        ],
        version: "56a8340"
      }}
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
