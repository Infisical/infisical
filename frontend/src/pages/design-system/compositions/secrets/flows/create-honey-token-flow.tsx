import { useState } from "react";
import slugify from "@sindresorhus/slugify";
import { ArrowRightIcon } from "lucide-react";
import { z } from "zod";

import { Alert, AlertDescription } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import { Field, FieldError } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline } from "@app/components/v4/ui/layout";
import { SmallText } from "@app/components/v4/ui/text";
import { Textarea } from "@app/components/v4/ui/textarea";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { slugSchema } from "@app/lib/schemas/slugSchema";

import { DiscardDialog, LOCAL_ONLY, secretsAt } from "./shared";
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
    shortDescription: "Environment",
    title: "Choose where to plant it",
    subtitle: "Select the environment where Infisical should store the decoy credentials."
  },
  {
    key: "mapping",
    name: "Mapping",
    shortDescription: "Secret keys",
    title: "Map the generated credentials",
    subtitle: "Choose the secret keys that will receive each decoy credential field."
  },
  {
    key: "details",
    name: "Details",
    shortDescription: "Name and description",
    title: "Add honey token details",
    subtitle: "Give this honey token a clear name and an optional description."
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
  secretsMapping: z.object({
    accessKeyId: z.string().trim().min(1, "Access Key ID secret name required"),
    secretAccessKey: z.string().trim().min(1, "Secret Access Key secret name required")
  })
});
export const HONEY_TOKEN_STEP_FIELDS = [
  ["environment"],
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
    <fieldset className={styles.mapping}>
      <legend className={styles.srOnly}>Honey token secret mappings</legend>
      <div className={styles.mappingGrid}>
        <span className={styles.mappingHead}>Decoy credential</span>
        <span />
        <span className={styles.mappingHead}>
          Secret name
          <Tooltip content="The name of the secret that the decoy credential will be mapped to in your project.">
            <span className={styles.hint}>
              <Icon name="info" size={14} label="About secret names" />
            </span>
          </Tooltip>
        </span>
        {MAPPING_ITEMS.map((item) => {
          const error = errors[`secretsMapping.${item.field}`];
          const inputId = `honey-mapping-${item.field}`;
          return (
            <div key={item.field} className={styles.mappingRow}>
              <span className={styles.mappingSource}>
                <Icon name={item.icon} />
                {item.name}
              </span>
              <span className={styles.mappingArrow}>
                <Icon icon={ArrowRightIcon} />
              </span>
              <div className={styles.mappingTarget}>
                <label htmlFor={inputId} className={styles.srOnly}>
                  {`Secret name for ${item.name}`}
                </label>
                <Input
                  id={inputId}
                  mono
                  value={mapping[item.field]}
                  placeholder={DEFAULT_MAPPING[item.field]}
                  invalid={Boolean(error)}
                  autoComplete="off"
                  spellCheck={false}
                  trailing={<Badge tone="warn">Decoy</Badge>}
                  onChange={(event) => {
                    onChange({ ...mapping, [item.field]: event.target.value });
                  }}
                />
                {error && <FieldError>{error}</FieldError>}
              </div>
            </div>
          );
        })}
      </div>
      {errors.secretsMapping && <FieldError>{errors.secretsMapping}</FieldError>}
      <Alert tone="info">
        <Icon name="info" />
        <AlertDescription>
          These keys will appear as normal secrets in your project but are tied to a sandboxed IAM
          user with zero permissions. Any API call made with these credentials triggers an alert.
        </AlertDescription>
      </Alert>
    </fieldset>
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
  const [draft, setDraft] = useState({
    environment: "",
    secretsMapping: { ...DEFAULT_MAPPING },
    name: "",
    description: ""
  });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
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
        title: "Successfully created AWS Honey Token",
        description: `${LOCAL_ONLY} No AWS stack or IAM user was created.`
      }
    );
    onOpenChange(false);
  };
  const next = () => {
    if (!validate(step)) return;
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
        description="Plant a decoy credential that alerts on access"
        steps={HONEY_TOKEN_STEPS.map((entry) => ({
          title: entry.name,
          summary: entry.shortDescription
        }))}
        current={step}
        onStepClick={(index) => {
          setErrors({});
          setStep(index);
        }}
        heading={current.title}
        subtitle={current.subtitle}
        footer={
          <Inline justify="between">
            <SmallText muted>{`Step ${step + 1} of ${HONEY_TOKEN_STEPS.length}`}</SmallText>
            <Inline gap={12}>
              <Button type="button" variant="outline" onClick={back}>
                Back
              </Button>
              <Button type="button" variant={last ? "primary" : "outline"} onClick={next}>
                {last ? "Create honey token" : "Next"}
              </Button>
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
