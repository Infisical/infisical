import { useEffect, useState } from "react";
import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { FieldMapping, FieldMappingRow } from "@app/components/v4/patterns/field-mapping";
import { Alert, AlertDescription } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import { Field, FieldError } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import { SmallText } from "@app/components/v4/ui/text";
import { Textarea } from "@app/components/v4/ui/textarea";
import {
  OrgPermissionHoneyTokenActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { isInfisicalCloud } from "@app/helpers/platform";
import {
  AwsHoneyTokenDeploymentUnavailableReason,
  HoneyTokenManagedBy
} from "@app/hooks/api/honeyTokens/enums";
import { slugSchema } from "@app/lib/schemas/slugSchema";

import { useOrgId, useOrgPermission } from "../../../../access/permissions";
import { useV4Adapter } from "../../../../data/adapters";
import { useCreateBlock } from "../row-actions/permissions";
import { InfoTip } from "./secret-rotation/fields";
import { DiscardDialog, Gate, secretsAt } from "./shared";
import type { AddFlowProps } from "./types";
import { ProviderLogo, WizardSheet } from "./wizard-sheet";

import styles from "./flows.module.css";

export const HONEY_TOKEN_DOCS_URL =
  "https://infisical.com/docs/documentation/platform/honey-tokens/overview";
export const DEFAULT_MAPPING = {
  accessKeyId: "AWS_ACCESS_KEY_ID",
  secretAccessKey: "AWS_SECRET_ACCESS_KEY"
};
export const HONEY_TOKEN_STEPS = [
  {
    key: "configuration",
    name: "Configuration",
    title: "Choose where to plant it"
  },
  {
    key: "mapping",
    name: "Mapping",
    title: "Map the generated credentials"
  },
  {
    key: "details",
    name: "Details",
    title: "Add honey token details"
  }
] as const;
const MAPPING_ITEMS = [
  { field: "accessKeyId", name: "Access Key ID", icon: "key" },
  { field: "secretAccessKey", name: "Secret Access Key", icon: "lock" }
] as const;

export const honeyTokenSchema = z.object({
  name: slugSchema({ field: "Name" }),
  description: z.string().trim().max(256, "Cannot exceed 256 characters").nullish(),
  environment: z.string({ required_error: "Required" }).min(1, "Required"),
  managedBy: z.nativeEnum(HoneyTokenManagedBy, { required_error: "Select an AWS account" }),
  secretsMapping: z.object({
    accessKeyId: z.string().trim().min(1, "Access Key ID secret name required"),
    secretAccessKey: z.string().trim().min(1, "Secret Access Key secret name required")
  })
});
export const HONEY_TOKEN_STEP_FIELDS = [
  ["environment", "managedBy"],
  ["secretsMapping"],
  ["name", "description"]
];

export function HoneyTokenMappingFields({
  mapping,
  errors,
  onChange
}: {
  mapping: typeof DEFAULT_MAPPING;
  errors: Record<string, string>;
  onChange: (mapping: typeof DEFAULT_MAPPING) => void;
}) {
  return (
    <Stack gap={16}>
      <FieldMapping
        legend="Honey token secret mappings"
        sourceHeader="Decoy credential"
        targetHeader="Secret name"
        targetHint={
          <InfoTip content="The name of the secret that the decoy credential will be mapped to in your project." />
        }
      >
        {MAPPING_ITEMS.map((item) => (
          <FieldMappingRow
            key={item.field}
            source={item.name}
            icon={item.icon}
            mono
            value={mapping[item.field]}
            placeholder={DEFAULT_MAPPING[item.field]}
            error={errors[`secretsMapping.${item.field}`]}
            autoComplete="off"
            spellCheck={false}
            trailing={<Badge tone="warn">Decoy</Badge>}
            onChange={(event) => {
              onChange({ ...mapping, [item.field]: event.target.value });
            }}
          />
        ))}
      </FieldMapping>
      {errors.secretsMapping && <FieldError>{errors.secretsMapping}</FieldError>}
      <Alert tone="info">
        <Icon name="info" />
        <AlertDescription>
          These appear as normal secrets but belong to an IAM user with no permissions. Any API call
          made with them triggers an alert.
        </AlertDescription>
      </Alert>
    </Stack>
  );
}

export function HoneyTokenDetailsFields({
  name,
  description,
  suggestedName,
  errors,
  onChange
}: {
  name: string;
  description: string;
  suggestedName?: string;
  errors: Record<string, string>;
  onChange: (value: { name?: string; description?: string }) => void;
}) {
  return (
    <>
      <Field label="Name" error={errors.name}>
        <Input
          autoFocus
          value={name}
          placeholder={suggestedName || "aws-canary-prod-key"}
          kbd={suggestedName && !name ? "Tab" : undefined}
          trailing={<span className={styles.warnSlot} />}
          invalid={Boolean(errors.name)}
          autoComplete="off"
          onKeyDown={(event) => {
            if (event.key !== "Tab" || event.shiftKey || name || !suggestedName) return;
            event.preventDefault();
            onChange({ name: suggestedName });
          }}
          onChange={(event) => {
            onChange({ name: event.target.value });
          }}
        />
      </Field>
      <Field label="Description" optional error={errors.description}>
        <Textarea
          value={description}
          rows={4}
          className={styles.fixedTextarea}
          placeholder="Describe where this decoy is planted and who should respond..."
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </Field>
    </>
  );
}

export function CreateHoneyTokenFlow({
  open,
  onOpenChange,
  scope,
  resources,
  onCreate
}: AddFlowProps) {
  const [draft, setDraft] = useState<{
    environment: string;
    managedBy?: HoneyTokenManagedBy;
    secretsMapping: typeof DEFAULT_MAPPING;
    name: string;
    description: string;
  }>({
    environment: "",
    secretsMapping: { ...DEFAULT_MAPPING },
    name: "",
    description: ""
  });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [accountChosen, setAccountChosen] = useState(false);
  const orgId = useOrgId();
  const { permission } = useOrgPermission();
  const createBlock = useCreateBlock(
    scope.project,
    ProjectPermissionSub.HoneyTokens,
    ProjectPermissionHoneyTokenActions.Create,
    draft.environment ? [draft.environment] : scope.environments.map((entry) => entry.value),
    scope.path,
    "create honey tokens here"
  );
  const canSetUpAccount = permission.can(
    OrgPermissionHoneyTokenActions.Setup,
    OrgPermissionSubjects.HoneyTokens
  );
  const deployment = useV4Adapter("secrets").useHoneyTokenDeploymentOptions({
    refetchOnWindowFocus: "always"
  });
  const optionFor = (managedBy: HoneyTokenManagedBy) =>
    deployment.data?.find((option) => option.managedBy === managedBy);
  const isAvailable = (managedBy: HoneyTokenManagedBy) => {
    const option = optionFor(managedBy);
    return Boolean(option && !option.unavailableReason);
  };
  const organizationReady = isAvailable(HoneyTokenManagedBy.Organization);
  const instanceReady = isInfisicalCloud() && isAvailable(HoneyTokenManagedBy.Instance);
  useEffect(() => {
    if (!deployment.data || accountChosen) return;
    if (organizationReady)
      setDraft((current) => ({ ...current, managedBy: HoneyTokenManagedBy.Organization }));
    else if (instanceReady)
      setDraft((current) => ({ ...current, managedBy: HoneyTokenManagedBy.Instance }));
  }, [deployment.data, accountChosen, organizationReady, instanceReady]);
  let organizationDescription =
    "Ask an organization admin to connect an AWS account to use this option.";
  if (organizationReady)
    organizationDescription =
      "Decoy credentials are created in your organization's connected AWS account.";
  else if (canSetUpAccount)
    organizationDescription = "Connect your organization's AWS account to use this option.";
  const accountChoices = [
    ...(isInfisicalCloud()
      ? [
          {
            value: HoneyTokenManagedBy.Instance,
            label: "Infisical managed",
            description: isAvailable(HoneyTokenManagedBy.Instance)
              ? "Decoy credentials are created in an Infisical-managed AWS account. No setup needed."
              : "Temporarily unavailable. Contact support if this persists.",
            disabled: !isAvailable(HoneyTokenManagedBy.Instance)
          }
        ]
      : []),
    {
      value: HoneyTokenManagedBy.Organization,
      label: "Self hosted",
      description: organizationDescription,
      disabled: !organizationReady
    }
  ];
  const setupLabel =
    optionFor(HoneyTokenManagedBy.Organization)?.unavailableReason ===
    AwsHoneyTokenDeploymentUnavailableReason.StackVerificationPending
      ? "Finish AWS account setup"
      : "Connect AWS account";
  const accountError = () => {
    if (!deployment.data)
      return deployment.error
        ? "Couldn't load where this honey token can be created."
        : "Still loading where this honey token can be created. Try again in a moment.";
    if (draft.managedBy === HoneyTokenManagedBy.Organization && !organizationReady)
      return instanceReady
        ? "Finish connecting your AWS account, or choose Infisical managed."
        : "Finish connecting your AWS account to create a honey token.";
    return undefined;
  };
  const patch = (value: Partial<typeof draft>) => {
    setDraft((current) => ({ ...current, ...value }));
    setDirty(true);
  };
  const close = () => {
    if (dirty) setDiscard(true);
    else onOpenChange(false);
  };
  const suggestedName = draft.environment
    ? slugify(`AWS honey token ${draft.environment}`, { lowercase: true, decamelize: false })
        .slice(0, 64)
        .replace(/-+$/, "")
    : "";

  const validate = (index: number) => {
    const parsed = honeyTokenSchema.safeParse(draft);
    const issues: Record<string, string> = {};
    if (!parsed.success)
      parsed.error.issues.forEach((issue) => {
        const key = issue.path.join(".");
        if (HONEY_TOKEN_STEP_FIELDS[index].includes(String(issue.path[0])) && !issues[key])
          issues[key] = issue.message;
      });
    setErrors(issues);
    return Object.keys(issues).length === 0;
  };
  const checkMapping = () => {
    const values = Object.values(draft.secretsMapping).map((value) => value.trim());
    if (new Set(values).size !== values.length) {
      setErrors({ secretsMapping: "Secret mapping names must be unique." });
      return false;
    }
    const existing = new Set(
      secretsAt(resources, scope.project, draft.environment, scope.path).map(
        (secret) => secret.name
      )
    );
    const conflicts = values.filter((value) => existing.has(value));
    if (conflicts.length) {
      setErrors({
        secretsMapping: `The following secrets already exist in this path: ${conflicts.join(", ")}`
      });
      return false;
    }
    return true;
  };
  const submit = () => {
    const name = draft.name.trim();
    const mapped = [
      draft.secretsMapping.accessKeyId.trim(),
      draft.secretsMapping.secretAccessKey.trim()
    ];
    const at = { project: scope.project, environment: draft.environment, path: scope.path };
    onCreate(
      [
        {
          ...at,
          kind: "honey",
          name,
          provider: "AWS",
          managedBy: draft.managedBy,
          status: "active",
          description: draft.description.trim(),
          mappedKeys: mapped
        },
        ...mapped.map((key) => ({
          ...at,
          kind: "secret" as const,
          name: key,
          value: {
            status: "present" as const,
            value: `fake-decoy-${key.toLowerCase().replace(/_/g, "-")}`
          },
          comment: "",
          tags: [],
          metadata: [],
          version: 1,
          honeyToken: true
        }))
      ],
      {
        title: "Successfully created AWS Honey Token"
      }
    );
    onOpenChange(false);
  };
  const next = () => {
    if (!validate(step)) return;
    if (step === 0) {
      const message = accountError();
      if (message) {
        setErrors({ managedBy: message });
        return;
      }
    }
    if (step === 1 && !checkMapping()) return;
    if (step === HONEY_TOKEN_STEPS.length - 1) {
      submit();
      return;
    }
    setStep(step + 1);
  };
  const back = () => {
    if (step === 0) {
      close();
      return;
    }
    setErrors({});
    setStep(step - 1);
  };
  const current = HONEY_TOKEN_STEPS[step];
  const last = step === HONEY_TOKEN_STEPS.length - 1;

  return (
    <>
      <WizardSheet
        open={open}
        onRequestClose={close}
        media={<ProviderLogo image="Amazon Web Services.png" size={32} />}
        title={
          <span className={styles.titleLink}>
            AWS honey token
            <Button asChild variant="ghost" size="xs" iconRight="external">
              <a href={HONEY_TOKEN_DOCS_URL} target="_blank" rel="noopener noreferrer">
                Docs
              </a>
            </Button>
          </span>
        }
        description="Plant a decoy AWS credential that alerts when anyone uses it."
        steps={HONEY_TOKEN_STEPS.map((entry) => ({ title: entry.name }))}
        current={step}
        onStepClick={(index) => {
          setErrors({});
          setStep(index);
        }}
        heading={current.title}
        footer={
          <Inline justify="between">
            <SmallText muted>{`Step ${step + 1} of ${HONEY_TOKEN_STEPS.length}`}</SmallText>
            <Inline gap={12}>
              <Button type="button" variant="outline" onClick={back}>
                Back
              </Button>
              <Gate reason={last ? createBlock : undefined}>
                <Button
                  type="button"
                  variant={last ? "primary" : "outline"}
                  disabled={last && Boolean(createBlock)}
                  onClick={next}
                >
                  {last ? "Create honey token" : "Next"}
                </Button>
              </Gate>
            </Inline>
          </Inline>
        }
      >
        <form
          noValidate
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            next();
          }}
        >
          {current.key === "configuration" && (
            <Field label="Environment" error={errors.environment}>
              <Combobox
                label="Environment"
                options={scope.environments.map((entry) => ({ ...entry, meta: entry.value }))}
                value={draft.environment}
                placeholder="Select an environment..."
                invalid={Boolean(errors.environment)}
                onValueChange={(environment) => {
                  patch({ environment });
                  setErrors({});
                }}
              />
            </Field>
          )}
          {current.key === "configuration" && (
            <Stack gap={8}>
              <Field
                label="AWS account"
                description={
                  accountChoices.find((choice) => choice.value === draft.managedBy)?.description
                }
                error={errors.managedBy}
              >
                <Select
                  label="AWS account"
                  placeholder="Select an AWS account..."
                  options={accountChoices}
                  value={draft.managedBy}
                  invalid={Boolean(errors.managedBy)}
                  onChange={(value) => {
                    setAccountChosen(true);
                    patch({ managedBy: value as HoneyTokenManagedBy });
                    setErrors({});
                  }}
                />
              </Field>
              {deployment.data && !organizationReady && canSetUpAccount && (
                <Inline>
                  <Button asChild variant="link" size="sm" iconRight="external">
                    <a
                      href={`/organizations/${orgId}/projects/secret-management/product-settings`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {setupLabel}
                    </a>
                  </Button>
                </Inline>
              )}
              {Boolean(deployment.error) && !deployment.data && (
                <Inline>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon="sync"
                    onClick={() => deployment.refetch()}
                  >
                    Retry
                  </Button>
                </Inline>
              )}
            </Stack>
          )}
          {current.key === "mapping" && (
            <HoneyTokenMappingFields
              mapping={draft.secretsMapping}
              errors={errors}
              onChange={(secretsMapping) => {
                patch({ secretsMapping });
                setErrors({});
              }}
            />
          )}
          {current.key === "details" && (
            <HoneyTokenDetailsFields
              name={draft.name}
              description={draft.description}
              suggestedName={suggestedName}
              errors={errors}
              onChange={(value) => {
                patch(value);
                if (value.name !== undefined) setErrors({});
              }}
            />
          )}
        </form>
      </WizardSheet>
      <DiscardDialog
        open={discard}
        onKeep={() => setDiscard(false)}
        onDiscard={() => {
          setDiscard(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
