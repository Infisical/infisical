import { format } from "date-fns";

import { Alert } from "@app/components/v4/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { SecretValue } from "@app/components/v4/ui/sensitive-editor";
import { Snippet } from "@app/components/v4/ui/snippet";
import { SmallText, Text } from "@app/components/v4/ui/text";
import type { SecretRotation as ApiSecretRotation } from "@app/hooks/api/secretRotationsV2/enums";

import { useV4Adapter } from "../../../../data/adapters";
import {
  appConnectionName,
  rotationConnectionOf,
  type RotationResource,
  rotationTypeOf
} from "../flows/secret-rotation/model";
import {
  IS_ROTATION_DUAL_CREDENTIALS,
  SECRET_ROTATION_MAP
} from "../flows/secret-rotation/schemas";
import { CREDENTIAL_FIELDS, type CredentialField } from "./rotation-credentials";

import styles from "./rotation-actions.module.css";

function CredentialSet({
  title,
  description,
  icon,
  tone,
  fields,
  values
}: {
  title: string;
  description?: string;
  icon: "check" | "history";
  tone: "ok" | "warn";
  fields: CredentialField[];
  values?: Record<string, string>;
}) {
  return (
    <section className={styles.credentialSet}>
      <Text className={styles.credentialHead} data-tone={tone}>
        <Icon name={icon} size={14} />
        {title}
      </Text>
      {description && <SmallText muted>{description}</SmallText>}
      <div className={styles.credentialFrame}>
        {fields.map(({ field, label, sensitive }) => {
          const value = values?.[field];
          if (!value)
            return (
              <Field key={field} label={label}>
                <SmallText muted>None</SmallText>
              </Field>
            );
          return (
            <Field key={field} label={label}>
              {sensitive ? (
                <SecretValue value={value} label={label} />
              ) : (
                <Snippet value={value} label={label} copyLabel={`Copy ${label}`} />
              )}
            </Field>
          );
        })}
      </div>
    </section>
  );
}

export function RotationCredentialsDialog({
  open,
  rotation,
  onOpenChange,
  block
}: {
  open: boolean;
  rotation: RotationResource;
  onOpenChange: (open: boolean) => void;
  block?: string;
}) {
  const type = rotationTypeOf(rotation);
  const rotationType = SECRET_ROTATION_MAP[type].name;
  const appName = appConnectionName(rotationConnectionOf(rotation).app);
  const fields = CREDENTIAL_FIELDS[type];
  const { data } = useV4Adapter("secrets").useSecretRotationCredentials(
    { rotationId: rotation.id, type: type as unknown as ApiSecretRotation },
    { enabled: open && !block }
  );
  const credentials = (data?.generatedCredentials ?? []) as (Record<string, string> | undefined)[];
  const activeIndex = data?.activeIndex ?? 0;
  const active = credentials[activeIndex] ?? {};
  const retired = credentials[activeIndex === 0 ? 1 : 0];
  const next = rotation.nextRotationAt ? new Date(rotation.nextRotationAt) : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Generated credentials</DialogTitle>
        </DialogHeader>
        {block && (
          <Alert tone="warn" title="Access restricted">
            {block}.
          </Alert>
        )}
        <div className={styles.body} hidden={Boolean(block)}>
          <CredentialSet
            title="Current credentials"
            icon="check"
            tone="ok"
            fields={fields}
            values={active}
          />
          <CredentialSet
            title="Retired credentials"
            description="Revoked at the next rotation."
            icon="history"
            tone="warn"
            fields={fields}
            values={retired}
          />
          {!IS_ROTATION_DUAL_CREDENTIALS[type] && (
            <Alert tone="info" title={`${appName} retired credentials behavior`}>
              {rotationType} rotations use a single credential set, so retired credentials cannot
              authenticate with {appName} during their{" "}
              <a
                target="_blank"
                href="https://infisical.com/docs/documentation/platform/secret-rotation/overview#how-rotation-works"
                rel="noopener noreferrer"
              >
                inactive period
              </a>
              . This is a limitation of {appName}.
            </Alert>
          )}
          {next && (
            <SmallText className={styles.nextRotation}>
              <Icon name="sync" size={14} />
              <span>
                Next rotation occurs on: {format(next, "MM/dd/yyyy")} at {format(next, "h:mm aa")}{" "}
                <span className={styles.muted}>(Local Time)</span>
              </span>
            </SmallText>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
