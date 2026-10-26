import { format } from "date-fns";

import { Alert } from "@app/components/v4/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { SecretInput } from "@app/components/v4/ui/sensitive-editor";
import { Snippet } from "@app/components/v4/ui/snippet";
import { SmallText, Text } from "@app/components/v4/ui/text";

import type { Resource } from "../../secrets-model";
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
import { CREDENTIAL_FIELDS, type CredentialField, credentialsOf } from "./rotation-credentials";

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
  description: string;
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
      <SmallText muted>{description}</SmallText>
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
                <SecretInput value={value} label={label} />
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
  resources,
  onOpenChange
}: {
  open: boolean;
  rotation: RotationResource;
  resources: readonly Resource[];
  onOpenChange: (open: boolean) => void;
}) {
  const type = rotationTypeOf(rotation);
  const rotationType = SECRET_ROTATION_MAP[type].name;
  const appName = appConnectionName(rotationConnectionOf(rotation).app);
  const fields = CREDENTIAL_FIELDS[type];
  const { active, retired } = credentialsOf(rotation, resources);
  const next = rotation.nextRotationAt ? new Date(rotation.nextRotationAt) : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Generated credentials</DialogTitle>
          <DialogDescription>View the current and retired {rotationType}.</DialogDescription>
        </DialogHeader>
        <div className={styles.body}>
          <CredentialSet
            title="Current credentials"
            description="The active credential set currently mapped to the rotation secrets."
            icon="check"
            tone="ok"
            fields={fields}
            values={active}
          />
          <CredentialSet
            title="Retired credentials"
            description="The retired credential set that will be revoked during the next rotation cycle."
            icon="history"
            tone="warn"
            fields={fields}
            values={retired}
          />
          {!IS_ROTATION_DUAL_CREDENTIALS[type] && (
            <Alert tone="info" title={`${appName} retired credentials behavior`}>
              Due to {rotationType} Rotations utilizing a single credential set, retired credentials
              will not be able to authenticate with {appName} during their{" "}
              <a
                target="_blank"
                href="https://infisical.com/docs/documentation/platform/secret-rotation/overview#how-rotation-works"
                rel="noopener noreferrer"
              >
                inactive period
              </a>
              . This is a limitation of {appName} and cannot be rectified by Infisical.
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
