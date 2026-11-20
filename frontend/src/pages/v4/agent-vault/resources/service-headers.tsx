import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Field, FieldError } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { SmallText, Text } from "@infisical/cipher/ui/text";

import {
  MAX_CUSTOM_HEADERS,
  MAX_SUBSTITUTIONS,
  SURFACE_LABELS,
  type TServiceForm
} from "@app/components/agent-vault/service-sheet/serviceSchema";
import { AgentVaultSubstitutionSurface } from "@app/hooks/api/agentVault/enums";

import type { TServiceFormApi } from "./service-form";
import { VariableSecretInput } from "./variable-input";

import css from "./resources.module.css";

const SURFACES = Object.values(AgentVaultSubstitutionSurface);

type THeader = TServiceForm["customHeaders"][number];
type TSubstitution = TServiceForm["substitutions"][number];

export const CustomHeaderFields = ({
  projectId,
  api
}: {
  projectId: string;
  api: TServiceFormApi;
}) => {
  const { form, set, err } = api;
  const rows = form.customHeaders;
  const update = (index: number, change: Partial<THeader>) =>
    set(
      "customHeaders",
      rows.map((row, i) => (i === index ? { ...row, ...change } : row))
    );

  return (
    <Stack gap={8} className={css.headerFields}>
      <Stack gap={2}>
        <Text>Custom headers</Text>
        <SmallText muted>
          Added to every request to this service, on top of the credential.
        </SmallText>
      </Stack>
      {rows.map((row, index) => {
        const path = `customHeaders.${index}`;
        const nameError = err(`${path}.name`);
        const prefixError = err(`${path}.prefix`);
        const valueError = err(`${path}.value`);
        return (
          <div key={row.id ?? `new-${index}`} className={css.fieldRow}>
            <div className={css.nameCell}>
              <span className={css.miniLabel} data-repeat={index > 0 || undefined}>
                Name
              </span>
              <Field error={nameError}>
                <Input
                  mono
                  aria-label={`Header ${index + 1} name`}
                  value={row.name}
                  placeholder="X-Org-Id"
                  invalid={Boolean(nameError)}
                  onChange={(event) => update(index, { name: event.target.value })}
                />
              </Field>
            </div>
            <div className={css.prefixCell}>
              <span className={css.miniLabel} data-repeat={index > 0 || undefined}>
                Prefix
              </span>
              <Field error={prefixError}>
                <Input
                  mono
                  aria-label={`Header ${index + 1} prefix`}
                  value={row.prefix}
                  placeholder="Token"
                  invalid={Boolean(prefixError)}
                  onChange={(event) => update(index, { prefix: event.target.value })}
                />
              </Field>
            </div>
            <div className={css.valueCell}>
              <span className={css.miniLabel} data-repeat={index > 0 || undefined}>
                Value
              </span>
              <Field error={valueError}>
                <VariableSecretInput
                  projectId={projectId}
                  label={`Header ${index + 1} value`}
                  value={row.value}
                  hasStored={Boolean(row.id)}
                  placeholder="Value, or type {{"
                  invalid={Boolean(valueError)}
                  onChange={(value) => update(index, { value })}
                />
              </Field>
            </div>
            <span className={css.rowAction} data-first={index === 0 || undefined}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                icon="trash"
                iconOnly
                onClick={() =>
                  set(
                    "customHeaders",
                    rows.filter((_, i) => i !== index)
                  )
                }
              >
                {`Remove header ${index + 1}`}
              </Button>
            </span>
          </div>
        );
      })}
      {err("customHeaders") && <FieldError>{err("customHeaders")}</FieldError>}
      {rows.length < MAX_CUSTOM_HEADERS && (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            icon="plus"
            onClick={() => set("customHeaders", [...rows, { name: "", prefix: "", value: "" }])}
          >
            Add custom header
          </Button>
        </div>
      )}
    </Stack>
  );
};

export const SubstitutionFields = ({
  projectId,
  api
}: {
  projectId: string;
  api: TServiceFormApi;
}) => {
  const { form, set, err } = api;
  const rows = form.substitutions;
  const update = (index: number, change: Partial<TSubstitution>) =>
    set(
      "substitutions",
      rows.map((row, i) => (i === index ? { ...row, ...change } : row))
    );

  return (
    <Stack gap={8}>
      <Stack gap={2}>
        <Text>Substitutions</Text>
        <SmallText muted>
          Your agent sends a placeholder, and the proxy swaps it for the real value before
          forwarding.
        </SmallText>
      </Stack>
      {rows.map((row, index) => {
        const path = `substitutions.${index}`;
        return (
          <Stack key={row.id ?? `new-${index}`} gap={8}>
            <div className={css.fieldRow}>
              <div className={css.grow}>
                <span className={css.miniLabel}>Replace</span>
                <Field error={err(`${path}.placeholder`)}>
                  <Input
                    mono
                    aria-label={`Substitution ${index + 1} placeholder`}
                    value={row.placeholder}
                    placeholder="__API_TOKEN__"
                    invalid={Boolean(err(`${path}.placeholder`))}
                    onChange={(event) => update(index, { placeholder: event.target.value })}
                  />
                </Field>
              </div>
              <div className={css.grow}>
                <span className={css.miniLabel}>With</span>
                <Field error={err(`${path}.value`)}>
                  <VariableSecretInput
                    projectId={projectId}
                    label={`Substitution ${index + 1} value`}
                    value={row.value}
                    hasStored={Boolean(row.id)}
                    placeholder="Real value, or type {{"
                    invalid={Boolean(err(`${path}.value`))}
                    onChange={(value) => update(index, { value })}
                  />
                </Field>
              </div>
              <span className={css.rowAction} data-first>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  icon="trash"
                  iconOnly
                  onClick={() =>
                    set(
                      "substitutions",
                      rows.filter((_, i) => i !== index)
                    )
                  }
                >
                  {`Remove substitution ${index + 1}`}
                </Button>
              </span>
            </div>
            <Field label="Replace in" group error={err(`${path}.surfaces`)}>
              <Inline gap={16} wrap>
                {SURFACES.map((surface) => (
                  <Checkbox
                    key={surface}
                    label={SURFACE_LABELS[surface]}
                    checked={row.surfaces.includes(surface)}
                    onChange={(checked) =>
                      update(index, {
                        surfaces: checked
                          ? [...row.surfaces, surface]
                          : row.surfaces.filter((entry) => entry !== surface)
                      })
                    }
                  />
                ))}
              </Inline>
            </Field>
          </Stack>
        );
      })}
      {err("substitutions") && <FieldError>{err("substitutions")}</FieldError>}
      {rows.length < MAX_SUBSTITUTIONS && (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            icon="plus"
            onClick={() =>
              set("substitutions", [
                ...rows,
                { placeholder: "", value: "", surfaces: [AgentVaultSubstitutionSurface.Header] }
              ])
            }
          >
            Add substitution
          </Button>
        </div>
      )}
    </Stack>
  );
};
