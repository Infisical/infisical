import { useId, useMemo, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@infisical/cipher/ui/accordion";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { z } from "zod";

import { AWS_REGIONS } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  HoneyTokenConfigStatus,
  HoneyTokenType,
  type THoneyTokenConfig
} from "@app/hooks/api/honeyToken";
import { slugSchema } from "@app/lib/schemas";

import { failed, saved, toast } from "../../../access/toast";
import { RESTRICTED } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import type { HoneyTokenConnectionTest } from "../../../data/product-settings/contract";

import styles from "../components/product-settings.module.css";

const CF_TEMPLATE_URL =
  "https://infisical-static-assets.s3.us-east-1.amazonaws.com/honey-tokens/honey-tokens-v1.yaml";
const DEFAULT_STACK_NAME = "infisical-honey-tokens";
const DEFAULT_AWS_REGION = "us-east-1";
const REGION_SLUGS = new Set(AWS_REGIONS.map((region) => region.slug));

const schema = z.object({
  connectionId: z.string().min(1, "Select an AWS app connection"),
  webhookSigningKey: z
    .string()
    .min(1, "Webhook signing key is required")
    .regex(/^[a-fA-F0-9]+$/, "Signing key must be a hex string"),
  stackName: slugSchema({ max: 128, field: "Stack name" }),
  awsRegion: z.string().refine((region) => REGION_SLUGS.has(region), "Select an AWS region")
});

type Draft = z.infer<typeof schema>;

const randomSigningKey = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

const notReady = (result: HoneyTokenConnectionTest) =>
  result.status
    ? `Stack "${result.stackName}" is not ready (status: ${result.status}).`
    : `Stack "${result.stackName}" was not found. Deploy the stack first.`;

const draftFrom = (config: THoneyTokenConfig | null | undefined): Draft =>
  config?.decryptedConfig
    ? {
        connectionId: config.connectionId ?? "",
        webhookSigningKey: config.decryptedConfig.webhookSigningKey,
        stackName: config.decryptedConfig.stackName ?? DEFAULT_STACK_NAME,
        awsRegion: config.decryptedConfig.awsRegion ?? DEFAULT_AWS_REGION
      }
    : {
        connectionId: "",
        webhookSigningKey: randomSigningKey(),
        stackName: DEFAULT_STACK_NAME,
        awsRegion: DEFAULT_AWS_REGION
      };

const HoneyTokenSheet = ({
  config,
  canSetup,
  onOpenChange
}: {
  config: THoneyTokenConfig | null | undefined;
  canSetup: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const productSettings = useV4Adapter("productSettings");
  const { data: connections = [], isPending: connectionsPending } =
    productSettings.useAppConnections();
  const upsert = productSettings.useUpsertHoneyTokenConfig();
  const testConnection = productSettings.useTestHoneyTokenConnection();
  const formId = useId();
  const hasSavedConfig = Boolean(config?.id);
  const [initial, setInitial] = useState(() => draftFrom(config));
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useDiscardChangesGuard({ isDirty: dirty, onDiscard: () => onOpenChange(false) });
  const issues = submitted ? schema.safeParse(draft).error?.flatten().fieldErrors : undefined;
  const awsConnections = connections.filter(
    (connection) => connection.app === AppConnection.AWS && connection.projectId == null
  );
  const webhookUrl = useMemo(
    () =>
      `${window.location.protocol}//${window.location.host}/api/v1/honey-tokens/${HoneyTokenType.AWS}/trigger`,
    []
  );
  const command = [
    "aws cloudformation create-stack \\",
    `  --region '${draft.awsRegion || DEFAULT_AWS_REGION}' \\`,
    `  --stack-name '${draft.stackName || DEFAULT_STACK_NAME}' \\`,
    `  --template-url '${CF_TEMPLATE_URL}' \\`,
    "  --capabilities CAPABILITY_NAMED_IAM \\",
    "  --parameters \\",
    `    ParameterKey=WebhookUrl,ParameterValue='${webhookUrl}' \\`,
    `    ParameterKey=WebhookSigningKey,ParameterValue='${draft.webhookSigningKey}'`
  ].join("\n");

  const submit = async () => {
    setSubmitted(true);
    const parsed = schema.safeParse(draft);
    if (!parsed.success) return;
    setPending(true);
    try {
      try {
        await upsert.mutateAsync({
          type: HoneyTokenType.AWS,
          connectionId: parsed.data.connectionId,
          config: {
            webhookSigningKey: parsed.data.webhookSigningKey,
            stackName: parsed.data.stackName,
            awsRegion: parsed.data.awsRegion
          }
        });
      } catch (error) {
        failed("Failed to save honey token settings", error);
        return;
      }
      setInitial(draft);
      if (!hasSavedConfig) {
        saved("Settings saved. Deploy the CloudFormation stack, then select Save.");
        return;
      }
      try {
        const result = await testConnection.mutateAsync(HoneyTokenType.AWS);
        if (!result.isConnected) {
          failed(notReady(result));
          return;
        }
        saved("Honey token settings saved");
        onOpenChange(false);
      } catch (error) {
        failed("Settings saved, but the stack check failed", error);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Sheet open onOpenChange={(next) => (next ? undefined : guard.requestDiscard())}>
        <SheetContent size="lg" pending={pending}>
          <SheetHeader>
            <SheetTitle>Configure AWS honey tokens</SheetTitle>
            <SheetDescription>
              Plant a decoy IAM credential in your AWS account. Infisical alerts on every access
              attempt.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <form
              id={formId}
              noValidate
              autoComplete="off"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Stack gap={16}>
                <Field label="App connection" error={issues?.connectionId?.[0]}>
                  <Combobox
                    label="App connection"
                    placeholder="Select an AWS app connection..."
                    emptyText="No AWS app connections in this organization."
                    loading={connectionsPending}
                    invalid={Boolean(issues?.connectionId)}
                    options={awsConnections.map((connection) => ({
                      value: connection.id,
                      label: connection.name
                    }))}
                    value={draft.connectionId}
                    onChange={(connectionId) => setDraft({ ...draft, connectionId })}
                  />
                </Field>
                <Field label="Webhook signing key" error={issues?.webhookSigningKey?.[0]}>
                  <Inline gap={8} wrap={false}>
                    <div className={styles.grow}>
                      <SecretInput
                        aria-label="Webhook signing key"
                        readOnly={hasSavedConfig}
                        invalid={Boolean(issues?.webhookSigningKey)}
                        value={draft.webhookSigningKey}
                        onChange={(webhookSigningKey) => setDraft({ ...draft, webhookSigningKey })}
                      />
                    </div>
                    <Tooltip content="Copy signing key">
                      <Button
                        type="button"
                        variant="outline"
                        icon="copy"
                        iconOnly
                        onClick={() => {
                          navigator.clipboard
                            ?.writeText(draft.webhookSigningKey)
                            .then(() => toast({ tone: "neutral", title: "Signing key copied" }))
                            .catch((error) => failed("Failed to copy the signing key", error));
                        }}
                      >
                        Copy signing key
                      </Button>
                    </Tooltip>
                  </Inline>
                </Field>
                <Accordion type="single" collapsible>
                  <AccordionItem value="advanced">
                    <AccordionTrigger>Advanced options</AccordionTrigger>
                    <AccordionContent>
                      <Stack gap={16}>
                        <Field label="CloudFormation stack name" error={issues?.stackName?.[0]}>
                          <Input
                            mono
                            placeholder={DEFAULT_STACK_NAME}
                            invalid={Boolean(issues?.stackName)}
                            value={draft.stackName}
                            onChange={(event) =>
                              setDraft({ ...draft, stackName: event.target.value })
                            }
                          />
                        </Field>
                        <Field label="AWS region" error={issues?.awsRegion?.[0]}>
                          <Combobox
                            label="AWS region"
                            placeholder="Select a region..."
                            invalid={Boolean(issues?.awsRegion)}
                            options={AWS_REGIONS.map((region) => ({
                              value: region.slug,
                              label: region.name,
                              meta: region.slug
                            }))}
                            value={draft.awsRegion}
                            onChange={(awsRegion) => setDraft({ ...draft, awsRegion })}
                          />
                        </Field>
                      </Stack>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                {hasSavedConfig && (
                  <CodeBlock
                    label="Deploy CloudFormation stack"
                    icon="terminal"
                    format="plain"
                    wrap
                    code={command}
                    copyable
                    copyLabel="Copy command"
                  />
                )}
              </Stack>
            </form>
          </SheetBody>
          <SheetFooter>
            <Inline gap={8} justify="end">
              <Button variant="ghost" type="button" onClick={guard.requestDiscard}>
                Cancel
              </Button>
              <Button
                type="submit"
                form={formId}
                variant="primary"
                loading={pending}
                disabledReason={canSetup ? undefined : RESTRICTED}
              >
                {hasSavedConfig ? "Save" : "Next"}
              </Button>
            </Inline>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="Your unsaved honey token settings will be lost."
      />
    </>
  );
};

export const HoneyTokensCard = ({ canSetup }: { canSetup: boolean }) => {
  const productSettings = useV4Adapter("productSettings");
  const { data: config, isPending } = productSettings.useHoneyTokenConfig(HoneyTokenType.AWS);
  const testConnection = productSettings.useTestHoneyTokenConnection();
  const [open, setOpen] = useState(false);
  const verified = config?.status === HoneyTokenConfigStatus.Complete;
  const reason = canSetup ? undefined : RESTRICTED;

  const verify = async () => {
    try {
      const result = await testConnection.mutateAsync(HoneyTokenType.AWS);
      if (result.isConnected)
        saved(`CloudFormation stack "${result.stackName}" is deployed and healthy`);
      else failed(notReady(result));
    } catch (error) {
      failed("Failed to test the connection. Check your AWS app connection permissions.", error);
    }
  };

  return (
    <>
      <SettingsCard
        flush
        loading={isPending}
        title={
          <Inline gap={8} wrap={false}>
            AWS honey tokens
            {config && (
              <Badge tone={verified ? "ok" : "warn"} dot>
                {verified ? "Verified" : "Pending verification"}
              </Badge>
            )}
          </Inline>
        }
        description="Plant decoy IAM credentials in your AWS account. Infisical alerts on every access attempt."
        action={
          <Inline gap={8} wrap={false}>
            {config && (
              <Button
                variant="outline"
                loading={testConnection.isPending}
                disabledReason={reason}
                onClick={verify}
              >
                Verify connection
              </Button>
            )}
            <Button
              variant={config ? "outline" : "accent"}
              disabledReason={reason}
              onClick={() => setOpen(true)}
            >
              {config ? "Manage" : "Connect"}
            </Button>
          </Inline>
        }
      />
      {open && <HoneyTokenSheet config={config} canSetup={canSetup} onOpenChange={setOpen} />}
    </>
  );
};
