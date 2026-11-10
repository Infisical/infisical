import { useState } from "react";
import { z } from "zod";

import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { Combobox } from "@app/components/v4/ui/combobox";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Select } from "@app/components/v4/ui/select";
import { SettingsCard } from "@app/components/v4/ui/settings-card";
import { Textarea } from "@app/components/v4/ui/textarea";
import { isStorageHostname } from "@app/helpers/appConnections";
import { downloadFile } from "@app/helpers/download";
import { allowedEmailDomainsSchema } from "@app/helpers/email";
import type { TServerConfig, TUpdateServerConfigDTO } from "@app/hooks/api/admin/types";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

enum SignUpMode {
  Disabled = "disabled",
  Anyone = "anyone"
}

const ALL_ORGANIZATIONS = "all";
const NOTICE_HINT = "Supports HTML, Markdown, and plain text.";
const storageHostnamesSchema = z.string().array().max(50, "Add at most 50 hostnames");

const useSave = () => {
  const update = useV4Adapter("admin").useUpdateServerConfig();
  return async (dto: TUpdateServerConfigDTO) => {
    await update.mutateAsync(dto).catch((error: unknown) => {
      failed("Settings not saved", error);
      throw error;
    });
  };
};

const SignUpCard = ({ config }: { config: TServerConfig }) => {
  const save = useSave();
  const initial = {
    mode: config.allowSignUp ? SignUpMode.Anyone : SignUpMode.Disabled,
    domain: config.allowedSignUpDomain ?? ""
  };
  const [draft, setDraft] = useState(initial);
  const parsed = allowedEmailDomainsSchema.safeParse(draft.domain);
  const domainError =
    draft.mode === SignUpMode.Anyone ? parsed.error?.issues[0]?.message : undefined;
  return (
    <SettingsCard
      title="Allow user signups"
      dirty={draft.mode !== initial.mode || draft.domain !== initial.domain}
      saveDisabledReason={domainError ? "Fix the allowed email domains first" : undefined}
      onDiscard={() => setDraft(initial)}
      onSave={async () => {
        await save({
          allowSignUp: draft.mode !== SignUpMode.Disabled,
          allowedSignUpDomain: draft.mode === SignUpMode.Anyone ? (parsed.data ?? null) : null
        });
        saved("Signup settings updated");
      }}
    >
      <Field label="Signup mode">
        <Select
          label="Signup mode"
          value={draft.mode}
          onChange={(mode) => setDraft({ ...draft, mode: mode as SignUpMode })}
          options={[
            { value: SignUpMode.Disabled, label: "Disabled" },
            { value: SignUpMode.Anyone, label: "Anyone" }
          ]}
        />
      </Field>
      {draft.mode === SignUpMode.Anyone && (
        <Field
          label="Allowed email domains"
          description="Leave blank to allow any email domain."
          error={domainError}
        >
          <Input
            value={draft.domain}
            invalid={Boolean(domainError)}
            autoComplete="off"
            placeholder="gmail.com, aws.com, redhat.com"
            onChange={(event) => setDraft({ ...draft, domain: event.target.value })}
          />
        </Field>
      )}
    </SettingsCard>
  );
};

const DefaultOrganizationCard = ({ config }: { config: TServerConfig }) => {
  const save = useSave();
  const { data: organizations = [] } = useV4Adapter("admin").useUserOrganizations();
  const initial = config.defaultAuthOrgId ?? "";
  const [draft, setDraft] = useState(initial);
  return (
    <SettingsCard
      title="Default organization"
      description="SAML, LDAP, OIDC and GitHub logins are scoped to this organization."
      dirty={draft !== initial}
      onDiscard={() => setDraft(initial)}
      onSave={async () => {
        await save({ defaultAuthOrgId: draft || null });
        saved("Default organization updated");
      }}
    >
      <Field label="Organization">
        <Select
          label="Organization"
          value={draft || ALL_ORGANIZATIONS}
          onChange={(next) => setDraft(next === ALL_ORGANIZATIONS ? "" : next)}
          options={[
            { value: ALL_ORGANIZATIONS, label: "Allow all organizations" },
            ...organizations.map((org) => ({ value: org.id, label: org.name }))
          ]}
        />
      </Field>
    </SettingsCard>
  );
};

const TrustLdapEmailsCard = ({ config }: { config: TServerConfig }) => {
  const save = useSave();
  const initial = config.trustLdapEmails ?? false;
  const [draft, setDraft] = useState(initial);
  return (
    <SettingsCard
      title="LDAP email verification"
      dirty={draft !== initial}
      onDiscard={() => setDraft(initial)}
      onSave={async () => {
        await save({ trustLdapEmails: draft });
        saved("LDAP email verification setting updated");
      }}
    >
      <Checkbox
        label="Trust LDAP emails"
        description="Users provisioned through LDAP skip email verification on first login. SAML and OIDC users are unaffected."
        checked={draft}
        onChange={setDraft}
      />
    </SettingsCard>
  );
};

const NoticesCard = ({ config }: { config: TServerConfig }) => {
  const save = useSave();
  const initial = {
    authConsentContent: config.authConsentContent ?? "",
    pageFrameContent: config.pageFrameContent ?? ""
  };
  const [draft, setDraft] = useState(initial);
  return (
    <SettingsCard
      title="Notices"
      description="Shown during sign in and around every page of a session."
      dirty={
        draft.authConsentContent !== initial.authConsentContent ||
        draft.pageFrameContent !== initial.pageFrameContent
      }
      onDiscard={() => setDraft(initial)}
      onSave={async () => {
        await save(draft);
        saved("Notices updated");
      }}
    >
      <Field label="Auth consent content" description={NOTICE_HINT}>
        <Textarea
          rows={8}
          placeholder="**Auth Consent Message**"
          value={draft.authConsentContent}
          onChange={(event) => setDraft({ ...draft, authConsentContent: event.target.value })}
        />
      </Field>
      <Field label="Page frame content" description={NOTICE_HINT}>
        <Textarea
          rows={8}
          placeholder='<div style="background-color: red">TOP SECRET</div>'
          value={draft.pageFrameContent}
          onChange={(event) => setDraft({ ...draft, pageFrameContent: event.target.value })}
        />
      </Field>
    </SettingsCard>
  );
};

const StorageHostnamesCard = ({ config }: { config: TServerConfig }) => {
  const save = useSave();
  const initial = config.allowedStorageHostnames ?? [];
  const [draft, setDraft] = useState(initial);
  const [hostnameError, setHostnameError] = useState<string>();
  const limitError = storageHostnamesSchema.safeParse(draft).error?.issues[0]?.message;
  const error = hostnameError ?? limitError;
  return (
    <SettingsCard
      title="Allowed storage hostnames"
      description="Lets S3-compatible storage connections and session playback use your own storage servers, such as MinIO."
      dirty={draft.join("\n") !== initial.join("\n")}
      onDiscard={() => {
        setDraft(initial);
        setHostnameError(undefined);
      }}
      saveDisabledReason={limitError}
      onSave={async () => {
        await save({ allowedStorageHostnames: draft });
        toast({
          tone: "ok",
          title: "Allowed storage hostnames updated",
          description: "Reload the page before using them in this tab."
        });
      }}
    >
      <Field label="Hostnames" description="Include the port if it isn't 443." error={error}>
        <Combobox
          multiple
          mono
          label="Hostnames"
          placeholder="minio.example.com"
          emptyText="Type a hostname and press Enter"
          options={draft.map((hostname) => ({ value: hostname, label: hostname }))}
          value={draft}
          invalid={Boolean(error)}
          onChange={(next) => {
            setDraft(next);
            setHostnameError(undefined);
          }}
          onCreate={(query) => {
            const hostname = query.trim();
            if (!isStorageHostname(hostname)) {
              setHostnameError(
                "Enter a lowercase hostname, with a port if it isn't 443, such as minio.example.com:9000"
              );
              return;
            }
            if (draft.includes(hostname)) {
              setHostnameError(`${hostname} is already allowed`);
              return;
            }
            setDraft([...draft, hostname]);
            setHostnameError(undefined);
          }}
        />
      </Field>
    </SettingsCard>
  );
};

const UsageReportCard = () => {
  const generate = useV4Adapter("admin").useGenerateUsageReport();
  const [pending, setPending] = useState(false);
  return (
    <SettingsCard
      flush
      title="Offline usage reports"
      description="A signed report for offline license compliance and billing verification."
      action={
        <Button
          variant="outline"
          size="sm"
          icon="download"
          loading={pending}
          onClick={async () => {
            setPending(true);
            try {
              const { csvContent, filename } = await generate.mutateAsync();
              downloadFile(csvContent, filename, "text/csv");
              toast({ tone: "ok", title: "Usage report downloaded", description: filename });
            } catch {
              // The global mutation error handler already reports the failure.
            } finally {
              setPending(false);
            }
          }}
        >
          Generate report
        </Button>
      }
    />
  );
};

export const GeneralPage = () => {
  const { data: config, error } = useV4Adapter("admin").useServerConfig();
  if (error) throw error;
  if (!config)
    return (
      <Stack gap={24}>
        <PageHeader title="General" />
        <SettingsCard title="Allow user signups" loading />
        <SettingsCard title="Default organization" loading />
        <SettingsCard title="LDAP email verification" loading />
      </Stack>
    );
  return (
    <Stack gap={24}>
      <PageHeader title="General" />
      <SignUpCard key={`${config.allowSignUp}:${config.allowedSignUpDomain}`} config={config} />
      <DefaultOrganizationCard key={config.defaultAuthOrgId ?? ""} config={config} />
      <TrustLdapEmailsCard key={String(config.trustLdapEmails)} config={config} />
      <NoticesCard
        key={JSON.stringify([config.authConsentContent, config.pageFrameContent])}
        config={config}
      />
      <StorageHostnamesCard key={JSON.stringify(config.allowedStorageHostnames)} config={config} />
      {config.isOfflineUsageReportsEnabled && <UsageReportCard />}
    </Stack>
  );
};
