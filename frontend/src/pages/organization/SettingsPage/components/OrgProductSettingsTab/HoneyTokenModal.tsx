import crypto from "crypto";

import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy, faEye, faEyeSlash, faTerminal } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Dialog,
  DialogContent,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  IconButton,
  Input
} from "@app/components/v3";
import { OrgPermissionHoneyTokenActions, OrgPermissionSubjects } from "@app/context";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { useTimedReset, useToggle } from "@app/hooks";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import {
  HoneyTokenType,
  useGetHoneyTokenConfig,
  useTestHoneyTokenConnection,
  useUpsertHoneyTokenConfig
} from "@app/hooks/api/honeyToken";
import { slugSchema } from "@app/lib/schemas";

const CF_TEMPLATE_URL =
  "https://infisical-static-assets.s3.us-east-1.amazonaws.com/honey-tokens/honey-tokens-v1.yaml";

const DEFAULT_STACK_NAME = "infisical-honey-tokens";
const DEFAULT_AWS_REGION = "us-east-1";
const WEBHOOK_SIGNING_KEY_BYTES = 32;

const validAwsRegionSlugs = new Set(AWS_REGIONS.map((r) => r.slug));

const isValidAwsRegion = (region: string) => validAwsRegionSlugs.has(region);

const schema = z.object({
  connectionId: z.string().min(1, "AWS Connection is required"),
  webhookSigningKey: z
    .string()
    .min(1, "Webhook Signing Key is required")
    .regex(/^[a-fA-F0-9]+$/, "Signing key must be a hex string"),
  stackName: slugSchema({ max: 128, field: "stackName" }),
  awsRegion: z
    .string()
    .trim()
    .min(1, "AWS region is required")
    .refine(isValidAwsRegion, "Invalid AWS region")
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const HoneyTokenModal = ({ isOpen, onOpenChange }: Props) => {
  const [isTokenVisible, setIsTokenVisible] = useToggle(false);
  const [, isTokenCopied, setTokenCopied] = useTimedReset({ initialState: false });
  const [, isCommandCopied, setCommandCopied] = useTimedReset({ initialState: false });

  const { data: appConnections = [], isPending: isLoadingConnections } = useListAppConnections();
  const { data: existingConfig } = useGetHoneyTokenConfig(HoneyTokenType.AWS, {
    retry: false
  });
  const { mutateAsync: upsertConfig, isPending: isSaving } = useUpsertHoneyTokenConfig();
  const { mutateAsync: testConnection, isPending: isTestingConnection } =
    useTestHoneyTokenConnection();

  const hasSavedConfig = Boolean(existingConfig?.id);

  const awsConnections = useMemo(
    () => appConnections.filter((conn) => conn.app === AppConnection.AWS && conn.projectId == null),
    [appConnections]
  );

  const webhookUrl = useMemo(() => {
    const { protocol, host } = window.location;
    return `${protocol}//${host}/api/v1/honey-tokens/${HoneyTokenType.AWS}/trigger`;
  }, []);

  const { control, handleSubmit, watch, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      connectionId: "",
      webhookSigningKey: "",
      stackName: DEFAULT_STACK_NAME,
      awsRegion: DEFAULT_AWS_REGION
    }
  });

  useEffect(() => {
    if (!existingConfig?.decryptedConfig) return;

    reset({
      connectionId: existingConfig.connectionId ?? "",
      webhookSigningKey: existingConfig.decryptedConfig.webhookSigningKey,
      stackName: existingConfig.decryptedConfig.stackName ?? DEFAULT_STACK_NAME,
      awsRegion: existingConfig.decryptedConfig.awsRegion ?? DEFAULT_AWS_REGION
    });
  }, [existingConfig, reset]);

  useEffect(() => {
    if (!isOpen) return;

    if (existingConfig?.decryptedConfig) {
      reset({
        connectionId: existingConfig.connectionId ?? "",
        webhookSigningKey: existingConfig.decryptedConfig.webhookSigningKey,
        stackName: existingConfig.decryptedConfig.stackName ?? DEFAULT_STACK_NAME,
        awsRegion: existingConfig.decryptedConfig.awsRegion ?? DEFAULT_AWS_REGION
      });
    } else {
      reset({
        connectionId: "",
        webhookSigningKey: crypto.randomBytes(WEBHOOK_SIGNING_KEY_BYTES).toString("hex"),
        stackName: DEFAULT_STACK_NAME,
        awsRegion: DEFAULT_AWS_REGION
      });
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const webhookSigningKey = watch("webhookSigningKey");
  const stackName = watch("stackName");
  const awsRegion = watch("awsRegion");

  const cfCommand = useMemo(
    () =>
      [
        "aws cloudformation create-stack \\",
        `  --region '${awsRegion || DEFAULT_AWS_REGION}' \\`,
        `  --stack-name '${stackName || DEFAULT_STACK_NAME}' \\`,
        `  --template-url '${CF_TEMPLATE_URL}' \\`,
        "  --capabilities CAPABILITY_NAMED_IAM \\",
        "  --parameters \\",
        `    ParameterKey=WebhookUrl,ParameterValue='${webhookUrl}' \\`,
        `    ParameterKey=WebhookSigningKey,ParameterValue='${webhookSigningKey}'`
      ].join("\n"),
    [awsRegion, stackName, webhookSigningKey, webhookUrl]
  );

  const saveConfig = async (data: FormData) =>
    upsertConfig({
      type: HoneyTokenType.AWS,
      connectionId: data.connectionId,
      config: {
        webhookSigningKey: data.webhookSigningKey,
        stackName: data.stackName,
        awsRegion: data.awsRegion
      }
    });

  const onNext = async (data: FormData) => {
    try {
      await saveConfig(data);
      createNotification({
        text: "Settings saved. Deploy the CloudFormation stack, then click Save.",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to save honey token settings",
        type: "error"
      });
    }
  };

  const onSave = async (data: FormData) => {
    try {
      await saveConfig(data);
      const result = await testConnection(HoneyTokenType.AWS);
      if (!result.isConnected) {
        createNotification({
          text: result.status
            ? `Stack "${result.stackName}" is not ready (status: ${result.status}).`
            : `Stack "${result.stackName}" was not found. Deploy the stack first.`,
          type: "error"
        });
        return;
      }
      createNotification({
        text: "Honey token settings saved successfully",
        type: "success"
      });
      onOpenChange(false);
    } catch {
      createNotification({
        text: "Failed to save honey token settings",
        type: "error"
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <div className="mb-4">
          <h2 className="text-lg font-medium text-mineshaft-100">Configure AWS Honey Tokens</h2>
          <p className="mt-1 text-sm text-mineshaft-400">
            Plant a decoy IAM credential in your AWS account. Infisical alerts on every access
            attempt.
          </p>
        </div>

        <form onSubmit={handleSubmit(hasSavedConfig ? onSave : onNext)}>
          <div className="mb-4 space-y-4">
            <Controller
              control={control}
              name="connectionId"
              render={({ field, fieldState: { error } }) => {
                const selectedConnection = awsConnections.find((conn) => conn.id === field.value);

                return (
                  <Field>
                    <FieldLabel>App Connection</FieldLabel>
                    <FieldContent>
                      <FilterableSelect
                        value={selectedConnection || null}
                        onChange={(newValue) => {
                          const singleValue = Array.isArray(newValue) ? newValue[0] : newValue;
                          if (singleValue && "id" in singleValue) {
                            field.onChange(singleValue.id);
                          } else {
                            field.onChange("");
                          }
                        }}
                        isError={Boolean(error)}
                        isLoading={isLoadingConnections}
                        options={awsConnections}
                        placeholder="Select an AWS App Connection..."
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                );
              }}
            />

            <Field>
              <FieldLabel>Webhook Signing Key</FieldLabel>
              <FieldContent>
                <div className="flex items-center gap-2">
                  <Controller
                    control={control}
                    name="webhookSigningKey"
                    render={({ field, fieldState: { error } }) => (
                      <Input
                        {...field}
                        type={isTokenVisible ? "text" : "password"}
                        placeholder="Enter webhook signing key..."
                        isError={Boolean(error)}
                        readOnly={hasSavedConfig}
                        className="flex-1 font-mono"
                      />
                    )}
                  />
                  <IconButton
                    aria-label="toggle signing key visibility"
                    variant="outline"
                    size="md"
                    onClick={() => setIsTokenVisible.toggle()}
                  >
                    <FontAwesomeIcon icon={isTokenVisible ? faEyeSlash : faEye} />
                  </IconButton>
                  <IconButton
                    aria-label="copy signing key"
                    variant="outline"
                    size="md"
                    onClick={() => {
                      navigator.clipboard.writeText(webhookSigningKey);
                      setTokenCopied(true);
                    }}
                  >
                    <FontAwesomeIcon icon={isTokenCopied ? faCheck : faCopy} />
                  </IconButton>
                </div>
              </FieldContent>
            </Field>

            <Accordion type="single" collapsible variant="ghost">
              <AccordionItem value="advanced">
                <AccordionTrigger>Advanced Options</AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Controller
                      control={control}
                      name="stackName"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel>CloudFormation Stack Name</FieldLabel>
                          <FieldContent>
                            <Input
                              {...field}
                              placeholder={DEFAULT_STACK_NAME}
                              isError={Boolean(error)}
                            />
                            <FieldError errors={[error]} />
                          </FieldContent>
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name="awsRegion"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel>AWS Region</FieldLabel>
                          <FieldContent>
                            <Input
                              {...field}
                              placeholder={DEFAULT_AWS_REGION}
                              isError={Boolean(error)}
                            />
                            <FieldError errors={[error]} />
                          </FieldContent>
                        </Field>
                      )}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {hasSavedConfig && (
            <div className="mb-4 rounded-md border border-border bg-container p-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-mineshaft-300">
                <FontAwesomeIcon icon={faTerminal} className="text-mineshaft-400" />
                <span className="font-medium tracking-wide uppercase">
                  Deploy CloudFormation Stack
                </span>
              </div>
              <p className="mb-3 text-sm text-mineshaft-400">
                Run this command to create the CloudFormation stack that provisions the decoy IAM
                user and wires CloudTrail alerts back to Infisical.
              </p>
              <div className="relative">
                <pre className="rounded-md border border-border bg-card p-4 pr-12 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-mineshaft-300">
                  <span className="text-mineshaft-400 select-none">$ </span>
                  {cfCommand}
                </pre>
                <IconButton
                  aria-label="copy CloudFormation command"
                  variant="outline"
                  size="xs"
                  className="absolute top-2 right-2"
                  onClick={() => {
                    navigator.clipboard.writeText(cfCommand);
                    setCommandCopied(true);
                  }}
                >
                  <FontAwesomeIcon icon={isCommandCopied ? faCheck : faCopy} />
                </IconButton>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} type="button">
              Cancel
            </Button>
            <OrgPermissionCan
              I={OrgPermissionHoneyTokenActions.Setup}
              a={OrgPermissionSubjects.HoneyTokens}
            >
              {(isAllowed) => (
                <Button
                  type="submit"
                  variant="org"
                  isPending={isSaving || isTestingConnection}
                  isDisabled={!isAllowed || isSaving || isTestingConnection}
                >
                  {hasSavedConfig ? "Save" : "Next"}
                </Button>
              )}
            </OrgPermissionCan>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
