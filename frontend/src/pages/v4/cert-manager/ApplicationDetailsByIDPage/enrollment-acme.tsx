import { useId, useMemo, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Field, FieldSet } from "@infisical/cipher/ui/field";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { useAutosave } from "@infisical/cipher/ui/settings-card";
import { SheetBody, SheetSections } from "@infisical/cipher/ui/sheet";
import { Snippet } from "@infisical/cipher/ui/snippet";
import { Switch } from "@infisical/cipher/ui/switch";
import { SmallText } from "@infisical/cipher/ui/text";

import type { TRevealAcmeEabSecretResponse } from "@app/hooks/api/pkiApplications/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { type AcmeDraft, type EnrollmentPanelProps, withDraft } from "./enrollment-model";
import { EnrollmentFooter } from "./enrollment-shared";

const AcmeOptions = ({
  value,
  disabled,
  onChange
}: {
  value: AcmeDraft;
  disabled?: boolean;
  onChange: (next: AcmeDraft) => void;
}) => (
  <FieldSet legend="Advanced options">
    <Switch
      layout="row"
      label="Skip DNS ownership verification"
      description="Skip DNS-01 and HTTP-01 challenge enforcement during enrollment."
      checked={value.skipDnsOwnershipVerification}
      disabled={disabled}
      disabledReason={
        value.skipEabBinding ? "Turn off Skip EAB binding first. Only one can be on." : undefined
      }
      onCheckedChange={(checked) =>
        onChange({ skipDnsOwnershipVerification: checked, skipEabBinding: false })
      }
    />
    <Switch
      layout="row"
      label="Skip EAB binding"
      description="Let ACME accounts register without an EAB key."
      checked={value.skipEabBinding}
      disabled={disabled}
      disabledReason={
        value.skipDnsOwnershipVerification
          ? "Turn off Skip DNS ownership verification first. Only one can be on."
          : undefined
      }
      onCheckedChange={(checked) =>
        onChange({ skipDnsOwnershipVerification: false, skipEabBinding: checked })
      }
    />
  </FieldSet>
);

const EabCredentials = ({
  applicationId,
  profileId
}: {
  applicationId: string;
  profileId: string;
}) => {
  const adapter = useV4Adapter("pkiApplications");
  const reveal = adapter.useRevealAcmeEabSecret();
  const rotate = adapter.useRotateAcmeEabSecret();
  const [credentials, setCredentials] = useState<TRevealAcmeEabSecretResponse | null>(null);
  const [action, setAction] = useState<"reveal" | "rotate" | null>(null);
  const onReveal = async () => {
    if (credentials) {
      setCredentials(null);
      return;
    }
    setAction("reveal");
    try {
      setCredentials(await reveal.mutateAsync({ applicationId, profileId }));
    } catch (error) {
      failed("Couldn't reveal the EAB credentials", error);
    } finally {
      setAction(null);
    }
  };
  const onRotate = async () => {
    setAction("rotate");
    try {
      await rotate.mutateAsync({ applicationId, profileId });
      setCredentials(await reveal.mutateAsync({ applicationId, profileId }));
      saved("EAB secret rotated");
    } catch (error) {
      failed("Couldn't rotate the EAB secret", error);
    } finally {
      setAction(null);
    }
  };
  return (
    <FieldSet
      legend="EAB credentials"
      actions={
        <Inline gap={8}>
          <Button
            variant="outline"
            size="sm"
            icon={credentials ? "eye-off" : "eye"}
            loading={action === "reveal"}
            disabled={action === "rotate"}
            onClick={onReveal}
          >
            {credentials ? "Hide" : "Reveal"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon="sync"
            loading={action === "rotate"}
            disabled={action === "reveal"}
            onClick={onRotate}
          >
            Rotate
          </Button>
        </Inline>
      }
    >
      {credentials ? (
        <>
          <Field label="EAB key ID">
            <Snippet label="EAB key ID" copyLabel="Copy EAB key ID" value={credentials.eabKid} />
          </Field>
          <Field label="EAB secret">
            <Snippet label="EAB secret" copyLabel="Copy EAB secret" value={credentials.eabSecret} />
          </Field>
        </>
      ) : (
        <SmallText muted>
          Reveal the key ID and secret to copy them into your ACME client.
        </SmallText>
      )}
    </FieldSet>
  );
};

const ConfiguredAcme = ({
  applicationId,
  profileId,
  state,
  header,
  busy,
  run,
  onCancel
}: EnrollmentPanelProps<"acme">) => {
  const adapter = useV4Adapter("pkiApplications");
  const set = adapter.useSetAcmeEnrollment();
  const clear = adapter.useClearAcmeEnrollment();
  const skipDns = Boolean(state.acme?.skipDnsOwnershipVerification);
  const skipEab = Boolean(state.acme?.skipEabBinding);
  const stored = useMemo(
    () => ({ skipDnsOwnershipVerification: skipDns, skipEabBinding: skipEab }),
    [skipDns, skipEab]
  );
  const { value, save, pending } = useAutosave({
    value: stored,
    errorMessage: "Couldn't update ACME enrollment. Try again.",
    onSave: async (next) => {
      await run(() => set.mutateAsync({ applicationId, profileId, ...next }));
      saved("ACME enrollment updated");
    }
  });
  return (
    <SheetSections
      header={header}
      footer={
        <EnrollmentFooter
          method="acme"
          configured
          dirty={false}
          pending={pending}
          busy={busy || pending}
          onCancel={onCancel}
          applicationId={applicationId}
          profileId={profileId}
          clear={clear}
        />
      }
    >
      <SheetBody>
        <Stack gap={24}>
          {state.acme?.directoryUrl && (
            <FieldSet legend="Endpoint">
              <Field
                label="ACME directory URL"
                description="Point your ACME client at this URL to register an account."
              >
                <Snippet
                  label="ACME directory URL"
                  copyLabel="Copy ACME directory URL"
                  value={state.acme.directoryUrl}
                />
              </Field>
            </FieldSet>
          )}
          <EabCredentials applicationId={applicationId} profileId={profileId} />
          <AcmeOptions value={value} disabled={pending} onChange={(next) => save(next)} />
        </Stack>
      </SheetBody>
    </SheetSections>
  );
};

const NewAcme = ({
  applicationId,
  profileId,
  header,
  draft,
  onDraft,
  onSaved,
  onCancel,
  busy,
  run
}: EnrollmentPanelProps<"acme">) => {
  const adapter = useV4Adapter("pkiApplications");
  const set = adapter.useSetAcmeEnrollment();
  const clear = adapter.useClearAcmeEnrollment();
  const formId = useId();
  const { value, change } = withDraft<AcmeDraft>(
    { skipDnsOwnershipVerification: false, skipEabBinding: false },
    draft,
    onDraft
  );
  const submit = async () => {
    try {
      await run(() => set.mutateAsync({ applicationId, profileId, ...value }));
      saved("ACME enrollment enabled");
      onSaved();
    } catch (error) {
      failed("Couldn't enable ACME enrollment", error);
    }
  };
  return (
    <SheetSections
      header={header}
      footer={
        <EnrollmentFooter
          method="acme"
          configured={false}
          formId={formId}
          dirty
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
          <AcmeOptions value={value} onChange={change} />
        </form>
      </SheetBody>
    </SheetSections>
  );
};

export const AcmeEnrollmentPanel = (props: EnrollmentPanelProps<"acme">) =>
  props.state.acmeConfigured ? <ConfiguredAcme {...props} /> : <NewAcme {...props} />;
