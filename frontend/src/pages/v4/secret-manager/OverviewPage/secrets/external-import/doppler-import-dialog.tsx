import { useMemo, useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";

import type { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import { ExternalMigrationImportStatus, type TDopplerConfig } from "@app/hooks/api/migration/types";

import { readableFailure, toast } from "../../../../access/toast";
import { useV4Adapter } from "../../../../data/adapters";

const configLabel = (config: TDopplerConfig) => {
  const prefix = `${config.environment}_`;
  return !config.root && config.name.startsWith(prefix)
    ? config.name.slice(prefix.length)
    : config.name;
};

export function DopplerImportDialog({
  connections,
  projectId,
  environment,
  path,
  onClose
}: {
  connections: TAvailableAppConnection[];
  projectId: string;
  environment: { value: string; label: string };
  path: string;
  onClose: () => void;
}) {
  const adapter = useV4Adapter("secrets");
  const importDoppler = adapter.useImportDopplerSecrets();
  const initialConnection = connections.length === 1 ? connections[0].id : "";
  const [draft, setDraft] = useState({ connectionId: initialConnection, project: "", config: "" });
  const completed = useRef(false);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: draft.connectionId !== initialConnection || Boolean(draft.project || draft.config),
    onDiscard: onClose
  });
  const projects = adapter.useDopplerProjects(draft.connectionId || undefined);
  const configs = adapter.useDopplerConfigs(
    draft.connectionId || undefined,
    draft.project || undefined
  );
  const configOptions = useMemo(
    () =>
      [...(configs.data ?? [])]
        .sort(
          (a, b) =>
            a.environment.localeCompare(b.environment) ||
            Number(b.root) - Number(a.root) ||
            a.name.localeCompare(b.name)
        )
        .map((config) => ({
          value: config.name,
          label: configLabel(config),
          group: config.environment,
          meta: config.root ? "Root" : undefined
        })),
    [configs.data]
  );

  const submit = async () => {
    completed.current = true;
    try {
      const response = await importDoppler
        .mutateAsync({
          connectionId: draft.connectionId,
          dopplerProject: draft.project,
          dopplerEnvironment: draft.config,
          targetProjectId: projectId,
          targetEnvironment: environment.value,
          targetSecretPath: path
        })
        .catch(readableFailure("Couldn't import secrets from Doppler."));
      toast(
        response.status === ExternalMigrationImportStatus.ApprovalRequired
          ? { title: "Secret change request created successfully. Awaiting approval." }
          : { tone: "ok", title: "Successfully imported secrets from Doppler" }
      );
      onClose();
    } catch (error) {
      completed.current = false;
      throw error;
    }
  };

  return (
    <>
      <MultiStep
        variant="dialog"
        open
        title="Import from Doppler"
        description={`Secrets go to ${environment.label} at ${path}.`}
        onOpenChange={(next) => {
          if (next || completed.current) return;
          requestDiscard();
        }}
        completeLabel="Import secrets"
        onComplete={submit}
        steps={[
          {
            title: "Source",
            validate: () => {
              const fields: Record<string, string> = {};
              if (!draft.connectionId) fields.connection = "Select a Doppler connection";
              if (!draft.project) fields.project = "Select a source project";
              if (!draft.config) fields.config = "Select a source config";
              return Object.keys(fields).length ? { fields } : true;
            },
            content: (
              <Stack gap={16}>
                {connections.length > 1 && (
                  <Field label="Doppler connection" name="connection">
                    <Combobox
                      label="Doppler connection"
                      placeholder="Select Doppler connection"
                      emptyText="No Doppler connections found"
                      options={connections.map((connection) => ({
                        value: connection.id,
                        label: connection.name
                      }))}
                      value={draft.connectionId}
                      onValueChange={(connectionId) =>
                        setDraft({ connectionId, project: "", config: "" })
                      }
                    />
                  </Field>
                )}
                <Field
                  label="Source project"
                  name="project"
                  error={projects.error ? "Failed to load Doppler projects." : undefined}
                >
                  <Combobox
                    label="Source project"
                    disabled={!draft.connectionId}
                    loading={Boolean(draft.connectionId) && projects.isPending}
                    invalid={Boolean(projects.error)}
                    placeholder={
                      draft.connectionId ? "Select source project" : "Select a connection first"
                    }
                    emptyText="No Doppler projects found"
                    options={(projects.data ?? []).map((project) => ({
                      value: project.slug,
                      label: project.name,
                      description: project.description ?? undefined
                    }))}
                    value={draft.project}
                    onValueChange={(project) =>
                      setDraft((current) => ({ ...current, project, config: "" }))
                    }
                  />
                </Field>
                <Field
                  label="Source config"
                  name="config"
                  error={configs.error ? "Failed to load Doppler configs." : undefined}
                >
                  <Combobox
                    label="Source config"
                    disabled={!draft.project}
                    loading={Boolean(draft.project) && configs.isPending}
                    invalid={Boolean(configs.error)}
                    placeholder={draft.project ? "Select source config" : "Select a project first"}
                    emptyText="No Doppler configs found"
                    options={configOptions}
                    value={draft.config}
                    onValueChange={(config) => setDraft((current) => ({ ...current, config }))}
                  />
                </Field>
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        title="Discard Doppler import?"
        description="Your selected Doppler project and config will be lost."
      />
    </>
  );
}
