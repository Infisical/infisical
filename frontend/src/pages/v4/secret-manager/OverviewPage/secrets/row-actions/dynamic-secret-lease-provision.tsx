import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  getDynamicSecretProviderRuntimeMetadata,
  type TDynamicSecretLeaseOutput
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/runtimeMetadata";
import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { CopyButton, SecretValue } from "@app/components/v4/ui/sensitive-editor";
import { Spinner } from "@app/components/v4/ui/spinner";
import { SmallText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import type { DynamicSecretResource } from "../flows/dynamic-secret-flow";
import { toMs } from "./dynamic-secret-leases";

import styles from "./dynamic-secret-actions.module.css";

export type LeaseRequest = { ttl?: string; config?: Record<string, unknown> };

type LeaseResult = {
  expireAt: string;
  data: Record<string, unknown>;
};

const FORM_ID = "dynamic-secret-provision-lease-form";

const token = () => Math.random().toString(36).slice(2, 10);

const fakeOutputValue = (key: string, name: string, expireAt: string) => {
  const upper = key.toUpperCase();
  if (upper === "DN_ARRAY") return [`cn=fake-${name}-${token()},ou=users,dc=example,dc=com`];
  if (upper === "EXPIRES_AT") return expireAt;
  if (upper === "TOKEN_TYPE") return "Bearer";
  if (upper === "SCOPE") return "fake-scope";
  if (upper.includes("EMAIL")) return `fake-${token()}@example.com`;
  if (upper.includes("USERNAME") || upper === "USERNAME") return `fake-${name}-${token()}`;
  return `fake-${token()}${token()}`;
};

const OPTIONAL_SHOWN = new Set(["USERNAME", "KEY_ID", "AUTH_KEY", "TOKEN_TYPE", "EXPIRES_AT"]);

export const fakeLeaseData = (
  provider: DynamicSecretProviders,
  name: string,
  expireAt: string,
  config?: Record<string, unknown>
): Record<string, unknown> => {
  const { output } = getDynamicSecretProviderRuntimeMetadata(provider).leaseCapabilities;
  if (output.type === "totp")
    return {
      TOTP: `fake-${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      TIME_REMAINING: 30 - (Math.floor(Date.now() / 1000) % 30)
    };
  if (output.type === "ssh")
    return {
      PRIVATE_KEY: `fake-private-key-${token()}${token()}`,
      SIGNED_KEY: `fake-ssh-cert-${token()}${token()} ${String(
        (config?.principals as string[] | undefined)?.[0] ?? name
      )}`
    };
  return Object.fromEntries(
    output.fields
      .filter((field) => !field.isOptional || OPTIONAL_SHOWN.has(field.key))
      .map((field) => [field.key, fakeOutputValue(field.key, name, expireAt)])
  );
};

function OutputFields({
  output,
  data
}: {
  output: Extract<TDynamicSecretLeaseOutput, { type: "fields" }>;
  data: Record<string, unknown>;
}) {
  return (
    <div className={styles.output}>
      {output.fields.map((field) => {
        const rawValue = data[field.key];
        if (field.isOptional && (rawValue === undefined || rawValue === null || rawValue === ""))
          return null;
        const value = field.format === "json" ? JSON.stringify(rawValue) : String(rawValue ?? "");
        return (
          <Field wide key={field.key} label={field.label}>
            <SecretValue value={value} label={field.label} />
          </Field>
        );
      })}
      {output.notice && (
        <Stack gap={8}>
          <SmallText muted>
            Important: Copy these credentials now. You will not be able to see them again after you
            close this dialog.
          </SmallText>
          {output.notice === "one-time-delayed" && (
            <SmallText muted>
              It may take a few minutes before the credentials are available for use.
            </SmallText>
          )}
        </Stack>
      )}
    </div>
  );
}

function TotpOutput({
  totp,
  remainingSeconds,
  onRegenerate
}: {
  totp: string;
  remainingSeconds: number;
  onRegenerate: () => void;
}) {
  const [remainingTime, setRemainingTime] = useState(remainingSeconds);

  useEffect(() => {
    setRemainingTime(remainingSeconds);
    const intervalId = window.setInterval(() => {
      setRemainingTime((previous) => {
        if (previous <= 1) {
          window.clearInterval(intervalId);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [totp, remainingSeconds]);

  return (
    <div className={styles.output}>
      <Field wide label="Time-based one-time password">
        <SecretValue value={totp} label="Time-based one-time password" />
      </Field>
      <span className={styles.countdown} data-tone={remainingTime < 10 ? "bad" : undefined}>
        <Icon name="clock" size={16} />
        {remainingTime > 0
          ? `Expires in ${remainingTime} ${remainingTime > 1 ? "seconds" : "second"}`
          : "Expired"}
      </span>
      {remainingTime === 0 && (
        <div>
          <Button onClick={onRegenerate}>Regenerate</Button>
        </div>
      )}
    </div>
  );
}

const download = (filename: string, content: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

function SshOutput({
  data,
  firstPrincipal
}: {
  data: { PRIVATE_KEY: string; SIGNED_KEY: string };
  firstPrincipal: string;
}) {
  const chmodCommand = "chmod 600 key.pem";
  const sshCommand = `ssh -i key.pem -o CertificateFile=cert.pub ${firstPrincipal}@<hostname>`;
  return (
    <div className={styles.output}>
      {(
        [
          ["Private Key", data.PRIVATE_KEY, "key.pem", "Download private key"],
          ["Signed Certificate", data.SIGNED_KEY, "cert.pub", "Download signed certificate"]
        ] as const
      ).map(([label, value, filename, downloadLabel]) => (
        <Field wide key={label} label={label}>
          <Inline gap={8}>
            <div className={styles.grow}>
              <SecretValue value={value} label={label} />
            </div>
            <Tooltip content={`Download ${filename}`}>
              <Button
                variant="outline"
                size="icon"
                iconOnly
                icon="download"
                aria-label={downloadLabel}
                onClick={() => download(filename, value)}
              />
            </Tooltip>
          </Inline>
        </Field>
      ))}
      {(
        [
          ["Set Private Key Permissions", chmodCommand, "Copy private key permissions command"],
          ["Connect to the Target Host", sshCommand, "Copy SSH connection command"]
        ] as const
      ).map(([label, command, copyLabel]) => (
        <Field wide key={label} label={label}>
          <Input
            value={command}
            readOnly
            mono
            trailing={<CopyButton value={command} label={copyLabel} iconOnly />}
          />
        </Field>
      ))}
      <SmallText muted>
        Important: Copy or download these credentials now. You will not be able to see them again
        after you close this dialog.
      </SmallText>
    </div>
  );
}

const ttlSchema = z
  .string()
  .refine((val) => (toMs(val) ?? 0) > 0, "TTL must be a positive number")
  .optional();

const formSchema = z.object({
  ttl: ttlSchema,
  namespace: z.string().optional(),
  principals: z.array(z.string().trim().min(1))
});

type TForm = z.infer<typeof formSchema>;

export function DynamicSecretLeaseDialog({
  entry: openEntry,
  provider,
  onClose,
  onProvision
}: {
  entry?: DynamicSecretResource;
  provider: DynamicSecretProviders;
  onClose: () => void;
  onProvision: (request: LeaseRequest) => LeaseResult;
}) {
  const lastEntry = useRef(openEntry);
  if (openEntry) lastEntry.current = openEntry;
  const entry = openEntry ?? lastEntry.current;
  const capabilities = getDynamicSecretProviderRuntimeMetadata(provider).leaseCapabilities;
  const { provisioner, fixedTtl, ttlDescription, output } = capabilities;
  const [result, setResult] = useState<LeaseResult>();
  const [principalInput, setPrincipalInput] = useState("");
  const schema =
    provisioner === "ssh"
      ? formSchema.extend({
          principals: z.array(z.string().trim().min(1)).min(1, "At least one principal is required")
        })
      : formSchema;
  const { control, handleSubmit, setValue, watch } = useForm<TForm>({
    resolver: zodResolver(schema),
    defaultValues: { ttl: "1h", namespace: "", principals: [] }
  });
  const principals = watch("principals");

  const provision = (request: LeaseRequest) => setResult(onProvision(request));

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!capabilities.autoGenerate || !openEntry || autoStarted.current) return;
    autoStarted.current = true;
    setResult(onProvision({}));
  }, [capabilities.autoGenerate, onProvision, openEntry]);

  const addPrincipal = () => {
    const trimmed = principalInput.trim();
    if (trimmed && !principals.includes(trimmed))
      setValue("principals", [...principals, trimmed], { shouldValidate: true });
    setPrincipalInput("");
  };

  const submit = handleSubmit(({ ttl, namespace, principals: requested }) => {
    if (provisioner === "kubernetes")
      provision({ ttl, config: { namespace: namespace || undefined } });
    else if (provisioner === "ssh") provision({ ttl, config: { principals: requested } });
    else provision({ ttl });
  });

  const ttlFeedback = fixedTtl ? `This provider has a fixed TTL of ${fixedTtl}.` : ttlDescription;

  let body;
  if (!result && capabilities.autoGenerate) {
    body = (
      <div className={styles.loading}>
        <Spinner label="Provisioning lease" />
      </div>
    );
  } else if (result && output.type === "totp") {
    body = (
      <TotpOutput
        totp={String(result.data.TOTP)}
        remainingSeconds={Number(result.data.TIME_REMAINING)}
        onRegenerate={() => provision({})}
      />
    );
  } else if (result && output.type === "ssh") {
    body = (
      <SshOutput
        data={result.data as { PRIVATE_KEY: string; SIGNED_KEY: string }}
        firstPrincipal={principals[0]}
      />
    );
  } else if (result && output.type === "fields") {
    body = <OutputFields output={output} data={result.data} />;
  } else {
    body = (
      <form id={FORM_ID} noValidate onSubmit={submit}>
        <Stack gap={16}>
          {provisioner === "kubernetes" && (
            <Controller
              control={control}
              name="namespace"
              render={({ field, fieldState: { error } }) => (
                <Field
                  wide
                  label="Namespace"
                  description="The Kubernetes namespace to lease the dynamic secret to. If omitted, the first configured namespace is used."
                  error={error?.message}
                >
                  <Input {...field} invalid={Boolean(error)} />
                </Field>
              )}
            />
          )}
          {provisioner === "ssh" && (
            <Controller
              control={control}
              name="principals"
              render={({ fieldState: { error } }) => (
                <Stack gap={8}>
                  <Field
                    wide
                    label="Principals"
                    description="The usernames to embed in the certificate. Each principal must be on the allowed list."
                    error={error?.message}
                  >
                    <Inline gap={8}>
                      <div className={styles.grow}>
                        <Input
                          value={principalInput}
                          invalid={Boolean(error)}
                          placeholder="Enter principal name..."
                          onChange={(event) => setPrincipalInput(event.target.value)}
                          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            addPrincipal();
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        icon="plus"
                        onClick={addPrincipal}
                        disabled={!principalInput.trim()}
                      >
                        Add
                      </Button>
                    </Inline>
                  </Field>
                  {principals.map((principal, index) => (
                    <Inline key={principal} gap={8}>
                      <div className={styles.grow}>
                        <Input value={principal} readOnly aria-label={`Principal ${principal}`} />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        iconOnly
                        icon="trash"
                        aria-label={`Remove principal ${principal}`}
                        onClick={() =>
                          setValue(
                            "principals",
                            principals.filter((_, itemIndex) => itemIndex !== index),
                            { shouldValidate: true }
                          )
                        }
                      />
                    </Inline>
                  ))}
                </Stack>
              )}
            />
          )}
          <Controller
            control={control}
            name="ttl"
            render={({ field, fieldState: { error } }) => (
              <Field
                wide
                label="Default TTL"
                description={provisioner === "default" ? ttlFeedback : undefined}
                error={error?.message}
              >
                <Input
                  {...field}
                  value={fixedTtl ?? field.value ?? ""}
                  disabled={Boolean(fixedTtl)}
                  invalid={Boolean(error)}
                />
              </Field>
            )}
          />
        </Stack>
      </form>
    );
  }

  return (
    <Dialog open={Boolean(openEntry)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Provision lease</DialogTitle>
          <DialogDescription>
            Generate temporary credentials from this dynamic secret.
          </DialogDescription>
        </DialogHeader>
        {entry && body}
        {!result && !capabilities.autoGenerate && (
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID}>
              Provision lease
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
