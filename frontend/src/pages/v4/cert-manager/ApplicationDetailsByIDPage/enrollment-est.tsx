import { useId, useState } from "react";
import { Field, FieldSet } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { SheetBody, SheetSections } from "@infisical/cipher/ui/sheet";
import { Snippet } from "@infisical/cipher/ui/snippet";
import { Switch } from "@infisical/cipher/ui/switch";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { type EnrollmentPanelProps, type EstDraft, withDraft } from "./enrollment-model";
import { EnrollmentFooter } from "./enrollment-shared";

const CA_CHAIN_PLACEHOLDER = [
  "-----BEGIN CERTIFICATE-----",
  "MIIDdzCCAl+gAwIBAgIUJrK4...",
  "-----END CERTIFICATE-----"
].join("\n");

export const EstEnrollmentPanel = ({
  applicationId,
  profileId,
  state,
  header,
  draft,
  onDraft,
  onSaved,
  onCancel,
  busy,
  run
}: EnrollmentPanelProps<"est">) => {
  const adapter = useV4Adapter("pkiApplications");
  const set = adapter.useSetEstEnrollment();
  const clear = adapter.useClearEstEnrollment();
  const formId = useId();
  const configured = state.estConfigured;
  const [error, setError] = useState<string>();
  const { value, change } = withDraft<EstDraft>(
    {
      passphrase: "",
      caChain: "",
      disableBootstrapCaValidation: Boolean(state.est?.disableBootstrapCaValidation)
    },
    draft,
    onDraft
  );

  const submit = async () => {
    const passphraseIssue = value.passphrase.length < 8 ? "Use at least 8 characters" : undefined;
    setError(passphraseIssue);
    if (passphraseIssue) return;
    try {
      await run(() =>
        set.mutateAsync({
          applicationId,
          profileId,
          passphrase: value.passphrase,
          disableBootstrapCaValidation: value.disableBootstrapCaValidation,
          caChain: value.caChain || undefined
        })
      );
      saved(configured ? "EST enrollment saved" : "EST enrollment enabled");
      onSaved();
    } catch (cause) {
      failed(configured ? "Couldn't save EST enrollment" : "Couldn't enable EST enrollment", cause);
    }
  };

  return (
    <SheetSections
      header={header}
      footer={
        <EnrollmentFooter
          method="est"
          configured={configured}
          formId={formId}
          dirty={Boolean(draft)}
          pending={busy}
          busy={busy}
          onCancel={onCancel}
          applicationId={applicationId}
          profileId={profileId}
          clear={clear}
        />
      }
    >
      <SheetBody>
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={24}>
            {configured && state.est?.estEndpointUrl && (
              <FieldSet legend="Endpoint">
                <Field
                  label="EST endpoint base URL"
                  description="Append /simpleenroll, /simplereenroll or /cacerts for each operation."
                >
                  <Snippet
                    label="EST endpoint base URL"
                    copyLabel="Copy EST endpoint base URL"
                    value={state.est.estEndpointUrl}
                  />
                </Field>
              </FieldSet>
            )}
            <FieldSet legend="Authentication">
              <Field
                label="Passphrase"
                description={
                  configured
                    ? "Enter the current passphrase or a new one to save changes. At least 8 characters."
                    : "At least 8 characters. EST clients authenticate with it."
                }
                error={error}
              >
                <SecretInput
                  value={value.passphrase}
                  invalid={Boolean(error)}
                  autoComplete="new-password"
                  onChange={(passphrase) => {
                    setError(undefined);
                    change({ passphrase });
                  }}
                />
              </Field>
              <Field
                label="CA chain"
                optional
                description="PEM-encoded chain returned by the EST endpoint."
              >
                <Textarea
                  rows={4}
                  mono
                  value={value.caChain}
                  placeholder={CA_CHAIN_PLACEHOLDER}
                  onChange={(event) => change({ caChain: event.target.value })}
                />
              </Field>
            </FieldSet>
            <FieldSet legend="Advanced options">
              <Switch
                layout="row"
                label="Disable bootstrap CA validation"
                description="Let EST clients skip server certificate validation during enrollment."
                checked={value.disableBootstrapCaValidation}
                onCheckedChange={(checked) => change({ disableBootstrapCaValidation: checked })}
              />
            </FieldSet>
          </Stack>
        </form>
      </SheetBody>
    </SheetSections>
  );
};
