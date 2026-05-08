import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CreditCard, Info, Key, Lock, Plus, ScrollText, Settings, User, Users } from "lucide-react";

import { Button } from "../Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../Card";
import { Field, FieldLabel } from "../Field";
import { Input } from "../Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../Select";
import { Switch } from "../Switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "../Tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs";

/**
 * Tabs render a horizontal or vertical set of triggers that swap a single
 * region of content. Built on Radix so keyboard navigation and ARIA wiring
 * come for free. Pick `filled` for primary view switching where the
 * segmented control reads as a control surface; pick one of the colored
 * underline variants (`project`, `org`, `sub-org`, `admin`) for in-page
 * section navigation tied to that identity surface.
 */
const meta = {
  title: "Generic/Tabs",
  component: Tabs,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      table: {
        disable: true
      }
    }
  }
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

function FilledRender() {
  const [value, setValue] = useState("account");
  return (
    <Tabs value={value} onValueChange={setValue} className="w-[420px]">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
      </TabsList>
      <TabsContent value="account" className="rounded-md border border-border p-4">
        Manage your account details, display name, and contact email.
      </TabsContent>
      <TabsContent value="password" className="rounded-md border border-border p-4">
        Update your password and review recent sign-in activity.
      </TabsContent>
      <TabsContent value="notifications" className="rounded-md border border-border p-4">
        Choose which product and security notifications you want to receive.
      </TabsContent>
    </Tabs>
  );
}

export const Filled: Story = {
  name: "Example: Filled",
  parameters: {
    docs: {
      description: {
        story:
          "The default filled segmented variant — use for primary view switching where the tab strip reads as a discrete control. The list sits in a subtly-tinted bordered pill; the active trigger lifts onto a brighter surface tone with its own thin border."
      }
    }
  },
  render: () => <FilledRender />
};

function ColoredVariantRender({ variant }: { variant: "project" | "org" | "sub-org" | "admin" }) {
  const [value, setValue] = useState("overview");
  return (
    <Tabs value={value} onValueChange={setValue} className="w-[420px]">
      <TabsList variant={variant}>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="pt-4">
        High-level summary of the resource and its current state.
      </TabsContent>
      <TabsContent value="activity" className="pt-4">
        Recent events, audit log entries, and lifecycle changes.
      </TabsContent>
      <TabsContent value="settings" className="pt-4">
        Configuration options for this resource.
      </TabsContent>
    </Tabs>
  );
}

export const Project: Story = {
  name: "Example: Project",
  parameters: {
    docs: {
      description: {
        story:
          "Underline variant for project-scoped pages — the active trigger picks up the project identity color."
      }
    }
  },
  render: () => <ColoredVariantRender variant="project" />
};

export const Org: Story = {
  name: "Example: Org",
  parameters: {
    docs: {
      description: {
        story:
          "Underline variant for organization-scoped pages — the active trigger picks up the org identity color."
      }
    }
  },
  render: () => <ColoredVariantRender variant="org" />
};

export const SubOrg: Story = {
  name: "Example: Sub-org",
  parameters: {
    docs: {
      description: {
        story:
          "Underline variant for sub-organization-scoped pages — the active trigger picks up the sub-org identity color."
      }
    }
  },
  render: () => <ColoredVariantRender variant="sub-org" />
};

export const Admin: Story = {
  name: "Example: Admin",
  parameters: {
    docs: {
      description: {
        story:
          "Underline variant for admin-scoped pages — the active trigger picks up the admin identity color."
      }
    }
  },
  render: () => <ColoredVariantRender variant="admin" />
};

function WithIconsRender() {
  const [value, setValue] = useState("general");
  return (
    <Tabs value={value} onValueChange={setValue} className="w-[460px]">
      <TabsList>
        <TabsTrigger value="general">
          <Settings />
          General
        </TabsTrigger>
        <TabsTrigger value="members">
          <Users />
          Members
        </TabsTrigger>
        <TabsTrigger value="audit">
          <ScrollText />
          Audit logs
        </TabsTrigger>
      </TabsList>
      <TabsContent value="general" className="rounded-md border border-border p-4">
        Workspace name, default region, and other top-level configuration.
      </TabsContent>
      <TabsContent value="members" className="rounded-md border border-border p-4">
        Invite teammates, manage roles, and review pending invitations.
      </TabsContent>
      <TabsContent value="audit" className="rounded-md border border-border p-4">
        Searchable history of administrative actions across the workspace.
      </TabsContent>
    </Tabs>
  );
}

export const WithIcons: Story = {
  name: "Example: With icons",
  parameters: {
    docs: {
      description: {
        story:
          "Drop a `lucide-react` icon beside the label inside each `TabsTrigger` — sizing and trigger padding adjust automatically. Use sparingly to anchor frequently-used sections; pure-text triggers usually read cleaner."
      }
    }
  },
  render: () => <WithIconsRender />
};

function DisabledRender() {
  const [value, setValue] = useState("overview");
  return (
    <Tabs value={value} onValueChange={setValue} className="w-[460px]">
      <TabsList variant="project">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="integrations">Integrations</TabsTrigger>
        <TabsTrigger value="scim" disabled>
          SCIM
        </TabsTrigger>
        <TabsTrigger value="audit">Audit logs</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="pt-4">
        High-level summary of the resource and its current state.
      </TabsContent>
      <TabsContent value="integrations" className="pt-4">
        Connect this resource to external systems and identity providers.
      </TabsContent>
      <TabsContent value="scim" className="pt-4">
        SCIM directory sync is part of the Enterprise plan.
      </TabsContent>
      <TabsContent value="audit" className="pt-4">
        Recent events, audit log entries, and lifecycle changes.
      </TabsContent>
    </Tabs>
  );
}

export const Disabled: Story = {
  name: "Example: Disabled tab",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `disabled` to a `TabsTrigger` to gate sections behind a plan, role, or feature flag. The trigger fades, becomes unclickable, and is skipped during keyboard navigation — Radix handles the ARIA state."
      }
    }
  },
  render: () => <DisabledRender />
};

function ControlledTabsRender() {
  const [value, setValue] = useState<"editor" | "preview" | "diff">("editor");
  return (
    <div className="flex w-[420px] flex-col gap-3">
      <Tabs value={value} onValueChange={(next) => setValue(next as typeof value)}>
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="diff">Diff</TabsTrigger>
        </TabsList>
        <TabsContent value="editor" className="rounded-md border border-border p-4">
          Edit the document source directly.
        </TabsContent>
        <TabsContent value="preview" className="rounded-md border border-border p-4">
          Rendered preview of the current draft.
        </TabsContent>
        <TabsContent value="diff" className="rounded-md border border-border p-4">
          Compare the draft against the last published version.
        </TabsContent>
      </Tabs>
      <p className="text-muted-foreground text-xs">
        Active value: <code>{value}</code>
      </p>
    </div>
  );
}

export const Controlled: Story = {
  name: "Example: Controlled",
  parameters: {
    docs: {
      description: {
        story:
          "Drive selection from outside by pairing `value` with `onValueChange`. Use this when the active tab needs to round-trip through URL search params, a parent reducer, or an analytics event — `defaultValue` is uncontrolled and won't sync."
      }
    }
  },
  render: () => <ControlledTabsRender />
};

function VerticalRender() {
  const [value, setValue] = useState("profile");
  return (
    <Tabs orientation="vertical" value={value} onValueChange={setValue} className="w-[480px]">
      <TabsList variant="project" className="w-40 shrink-0">
        <TabsTrigger value="profile">
          <User />
          Profile
        </TabsTrigger>
        <TabsTrigger value="security">
          <Lock />
          Security
        </TabsTrigger>
        <TabsTrigger value="billing">
          <CreditCard />
          Billing
        </TabsTrigger>
        <TabsTrigger value="api-keys">
          <Key />
          API keys
        </TabsTrigger>
      </TabsList>
      <TabsContent value="profile" className="rounded-md border border-border p-4">
        Personal details, avatar, and locale preferences.
      </TabsContent>
      <TabsContent value="security" className="rounded-md border border-border p-4">
        Two-factor settings, active sessions, and recovery options.
      </TabsContent>
      <TabsContent value="billing" className="rounded-md border border-border p-4">
        Payment method, invoices, and plan changes.
      </TabsContent>
      <TabsContent value="api-keys" className="rounded-md border border-border p-4">
        Issue and revoke personal API keys for scripting.
      </TabsContent>
    </Tabs>
  );
}

export const Vertical: Story = {
  name: "Example: Vertical",
  parameters: {
    docs: {
      description: {
        story:
          'Pair `orientation="vertical"` with one of the underline variants for settings-style layouts where the tab strip becomes a side rail. The colored indicator rides the left edge of the active trigger; icons sit naturally to the left of each label.'
      }
    }
  },
  render: () => <VerticalRender />
};

function AddMachineIdentityRender() {
  const [mode, setMode] = useState<"create" | "assign">("create");

  return (
    <Card className="w-[36rem]">
      <CardHeader className="border-b">
        <CardTitle>Add Machine Identity to Project</CardTitle>
        <CardDescription>Create a new machine identity or assign an existing one</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
          <div className="flex items-center justify-center gap-2">
            <TabsList>
              <TabsTrigger value="create">Create New</TabsTrigger>
              <TabsTrigger value="assign">Assign Existing</TabsTrigger>
            </TabsList>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-default text-accent">
                  <Info className="size-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Create a brand-new identity, or attach one already in the org.
              </TooltipContent>
            </Tooltip>
          </div>
          <TabsContent value="create" className="flex flex-col gap-4 pt-4">
            <Field>
              <FieldLabel htmlFor="machine-name">Name</FieldLabel>
              <Input id="machine-name" placeholder="Machine 1" />
            </Field>
            <Field>
              <FieldLabel htmlFor="machine-role">Role</FieldLabel>
              <Select defaultValue="no-access">
                <SelectTrigger id="machine-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-access">No Access</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="developer">Developer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-center gap-2">
              <Switch id="delete-protection" />
              <FieldLabel htmlFor="delete-protection" className="cursor-pointer">
                Delete Protection Disabled
              </FieldLabel>
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel>Metadata</FieldLabel>
              <div className="flex justify-end">
                <Button variant="outline" size="sm">
                  <Plus />
                  Add Key
                </Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="assign" className="flex flex-col gap-4 pt-4">
            <Field>
              <FieldLabel htmlFor="existing-identity">Identity</FieldLabel>
              <Select>
                <SelectTrigger id="existing-identity" className="w-full">
                  <SelectValue placeholder="Select an existing identity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ci-runner">ci-runner</SelectItem>
                  <SelectItem value="terraform">terraform</SelectItem>
                  <SelectItem value="backups">backups</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="existing-role">Role</FieldLabel>
              <Select defaultValue="no-access">
                <SelectTrigger id="existing-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-access">No Access</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="developer">Developer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </TabsContent>
        </Tabs>
      </CardContent>
      <div className="flex gap-3">
        <Button variant="project">Create</Button>
        <Button variant="ghost">Cancel</Button>
      </div>
    </Card>
  );
}

export const InCard: Story = {
  name: "Example: In Card",
  parameters: {
    docs: {
      description: {
        story:
          "Filled tabs inside a Card — switch between create and assign flows on a single section. The list sits centered under the bordered card header with an inline info tooltip on the right. Each `TabsContent` swaps the form body in place, so the footer actions stay anchored at the bottom of the card."
      }
    }
  },
  render: () => <AddMachineIdentityRender />
};
