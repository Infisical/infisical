import { useState } from "react";
import { useBlocker } from "@tanstack/react-router";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@app/components/v4/ui/accordion";
import { DiscardChangesAlertDialog } from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Code } from "@app/components/v4/ui/code";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { SecretInput } from "@app/components/v4/ui/secret-input";
import { SettingsCard } from "@app/components/v4/ui/settings-card";
import type { TGetEnvOverrides } from "@app/hooks/api/admin/types";

import { toast } from "../../access/toast";
import { ListToolbar } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";

const DOCS =
  "https://infisical.com/docs/self-hosting/configuration/envars#environment-variable-overrides";

const plural = (count: number) => `${count} unsaved change${count === 1 ? "" : "s"}`;

const OverridesEditor = ({ overrides }: { overrides: TGetEnvOverrides }) => {
  const updateServerConfig = useV4Adapter("admin").useUpdateServerConfig();
  const groups = Object.values(overrides);
  const [saved, setSaved] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.flatMap(({ fields }) => fields.map((f) => [f.key, f.value ?? ""])))
  );
  const [draft, setDraft] = useState(saved);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const unsaved = Object.keys(draft).filter((key) => draft[key] !== saved[key]);
  const dirty = unsaved.length > 0;
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true
  });

  const needle = search.toLowerCase().trim();
  const visible = groups
    .map((group) => ({
      ...group,
      fields: group.fields.filter(
        (field) =>
          !needle ||
          field.key.toLowerCase().includes(needle) ||
          (field.description ?? "").toLowerCase().includes(needle)
      )
    }))
    .filter((group) => group.fields.length > 0);

  return (
    <>
      <SettingsCard
        title="Overrides"
        action={
          <ListToolbar
            band
            search={search}
            onSearch={setSearch}
            placeholder="Search keys and descriptions"
          />
        }
        dirty={dirty}
        onDiscard={() => setConfirmDiscard(true)}
        onSave={async () => {
          await updateServerConfig.mutateAsync({
            envOverrides: Object.fromEntries(
              Object.entries(draft).filter(([, value]) => value !== "")
            )
          });
          setSaved(draft);
          toast({
            tone: "ok",
            title: "Environment overrides saved",
            description: "Changes can take up to 5 minutes to take effect."
          });
        }}
      >
        {visible.length === 0 ? (
          <EmptyState
            size="sm"
            icon="search"
            title={groups.length ? "No variables match" : "No environment variables to override"}
          />
        ) : (
          <Accordion
            type="multiple"
            value={needle ? visible.map((group) => group.name) : open}
            onValueChange={(next) => {
              if (!needle) setOpen(next);
            }}
          >
            {visible.map((group) => {
              const count = group.fields.filter((field) => unsaved.includes(field.key)).length;
              return (
                <AccordionItem key={group.name} value={group.name}>
                  <AccordionTrigger>
                    <Inline gap={8}>
                      {group.name}
                      {count > 0 && <Badge tone="warn">{plural(count)}</Badge>}
                    </Inline>
                  </AccordionTrigger>
                  <AccordionContent>
                    <Stack gap={16}>
                      {group.fields.map((field) => (
                        <Field
                          key={field.key}
                          label={
                            <Inline gap={8}>
                              <Code>{field.key}</Code>
                              {field.hasEnvEntry && (
                                <Badge tone="warn">Overrides an existing variable</Badge>
                              )}
                            </Inline>
                          }
                          description={field.description}
                        >
                          <SecretInput
                            autoComplete="off"
                            value={draft[field.key] ?? ""}
                            onChange={(value) => setDraft({ ...draft, [field.key]: value })}
                          />
                        </Field>
                      ))}
                    </Stack>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </SettingsCard>
      <DiscardChangesAlertDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        onDiscard={() => setDraft(saved)}
        description="Your unsaved changes to these environment overrides will be lost."
      />
      <DiscardChangesAlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(next) => {
          if (!next) blocker.reset?.();
        }}
        onDiscard={() => blocker.proceed?.()}
        description="You have unsaved changes to these environment overrides. Leaving this page will discard them."
      />
    </>
  );
};

export const EnvironmentPage = () => {
  const { data: overrides, error } = useV4Adapter("admin").useEnvOverrides();
  if (error) throw error;
  return (
    <Stack gap={24}>
      <PageHeader
        title="Environment variables"
        badges={<DocumentationLinkBadge href={DOCS} />}
        description="Saved overrides can take up to five minutes to reach every container."
      />
      {overrides ? (
        <OverridesEditor overrides={overrides} />
      ) : (
        <SettingsCard title="Overrides" loading />
      )}
    </Stack>
  );
};
