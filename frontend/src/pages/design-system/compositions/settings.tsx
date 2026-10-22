import { Alert, AlertDescription, AlertTitle } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Select } from "@app/components/v4/ui/select";
import { SettingsCard } from "@app/components/v4/ui/settings-card";

import { Shell, useCrumbs } from "./shared";

export default function Settings() {
  const { org } = useCrumbs();
  return (
    <Shell
      level="settings"
      current="general"
      crumbs={[org, { label: "Settings" }, { label: "General" }]}
    >
      <Stack gap={24}>
        <PageHeader
          title="General"
          description="Update your organization's name, incident contacts, and other general settings."
        />
        <Alert tone="info">
          <AlertTitle>Some settings have moved</AlertTitle>
          <AlertDescription>
            Audit log streams now live under Audit logs, and workflow integrations, OAuth
            applications, and external migrations have moved to Integrations.
          </AlertDescription>
        </Alert>
        <SettingsCard
          title="Organization details"
          description="Update your organization's name, slug, and default member role."
          hint="Changes apply to everyone in Acme Corp."
          onSave={() => {}}
        >
          <Stack gap={16}>
            <Field label="Organization name">
              <Input defaultValue="Acme Corp" />
            </Field>
            <Field label="Organization ID">
              <Input
                mono
                readOnly
                value="180870b7-f464-4740-8ffe-9d11c9245ea7"
                trailing={
                  <Button variant="ghost" size="icon-sm" icon="copy" iconOnly>
                    Copy ID
                  </Button>
                }
              />
            </Field>
            <Field label="Organization slug">
              <Input mono defaultValue="acme-corp" />
            </Field>
            <Field
              label="Default organization member role"
              description="Users joining your organization get this role unless an invite says otherwise."
            >
              <Select
                aria-label="Default role"
                options={[
                  { value: "member", label: "Member" },
                  { value: "admin", label: "Admin" },
                  { value: "no-access", label: "No access" }
                ]}
                value="member"
                onChange={() => {}}
              />
            </Field>
          </Stack>
        </SettingsCard>
        <SettingsCard
          title="Incident contacts"
          description="Contacts notified in the unlikely event of a severe incident."
          action={
            <Button variant="outline" size="sm" icon="plus">
              Add contact
            </Button>
          }
          hint="No incident contacts yet."
        >
          <Input icon="search" placeholder="Search incident contacts by email" />
        </SettingsCard>
      </Stack>
    </Shell>
  );
}
