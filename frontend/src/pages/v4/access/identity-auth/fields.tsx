import type { ReactNode } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Field, FieldSet } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { TagsInput } from "@infisical/cipher/ui/tags-input";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { isValidIpOrCidr } from "@app/helpers/ip";

import css from "./identity-auth.module.css";

type TextProps = {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: ReactNode;
  optional?: boolean;
  type?: "text" | "password" | "number";
};

export const TextField = ({
  name,
  label,
  value,
  onChange,
  placeholder,
  description,
  optional,
  type = "text"
}: TextProps) => (
  <Field name={name} label={label} description={description} optional={optional}>
    <Input
      type={type}
      autoComplete="off"
      min={type === "number" ? 0 : undefined}
      step={type === "number" ? 1 : undefined}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  </Field>
);

export const TextAreaField = ({
  name,
  label,
  value,
  onChange,
  placeholder,
  description,
  optional,
  rows = 4
}: Omit<TextProps, "type"> & { rows?: number }) => (
  <Field name={name} label={label} description={description} optional={optional}>
    <Textarea
      mono
      rows={rows}
      className={css.capped}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  </Field>
);

export const splitList = (value?: string | null) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const ListField = ({
  name,
  label,
  values,
  onChange,
  placeholder,
  description,
  optional,
  validate
}: {
  name: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  description?: ReactNode;
  optional?: boolean;
  validate?: (tag: string) => string | undefined;
}) => (
  <Field name={name} label={label} description={description} optional={optional}>
    <TagsInput
      mono
      label={label}
      placeholder={placeholder}
      value={values}
      validate={validate}
      onChange={onChange}
    />
  </Field>
);

export const SwitchField = ({
  name,
  label,
  description,
  checked,
  onChange
}: {
  name: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <Field name={name}>
    <Switch
      layout="row"
      label={label}
      description={description}
      checked={checked}
      onChange={onChange}
    />
  </Field>
);

export const SelectField = ({
  name,
  label,
  value,
  options,
  onChange,
  placeholder,
  description
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string; description?: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  description?: ReactNode;
}) => (
  <Field name={name} label={label} description={description}>
    <Select
      label={label}
      placeholder={placeholder}
      value={value}
      options={options}
      onChange={onChange}
    />
  </Field>
);

export type Pair = { key: string; value: string };

export const PairsField = ({
  name,
  label,
  pairs,
  onChange,
  keyLabel,
  valueLabel,
  keyPlaceholder,
  valuePlaceholder,
  addLabel,
  description
}: {
  name: string;
  label: string;
  pairs: Pair[];
  onChange: (pairs: Pair[]) => void;
  keyLabel: string;
  valueLabel: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel: string;
  description?: ReactNode;
}) => {
  const update = (index: number, patch: Partial<Pair>) =>
    onChange(pairs.map((pair, i) => (i === index ? { ...pair, ...patch } : pair)));
  return (
    <Field name={name} label={label} description={description} group>
      <Stack gap={8}>
        {pairs.map((pair, index) => (
          <div className={css.pairRow} key={`${name}-${index + 1}`}>
            <Input
              aria-label={`${keyLabel} ${index + 1}`}
              placeholder={keyPlaceholder}
              value={pair.key}
              onChange={(event) => update(index, { key: event.target.value })}
            />
            <Input
              aria-label={`${valueLabel} ${index + 1}`}
              placeholder={valuePlaceholder}
              value={pair.value}
              onChange={(event) => update(index, { value: event.target.value })}
            />
            <Button
              variant="ghost"
              size="icon"
              icon="x"
              iconOnly
              onClick={() => onChange(pairs.filter((_, i) => i !== index))}
            >
              {`Remove ${keyLabel.toLowerCase()} ${index + 1}`}
            </Button>
          </div>
        ))}
        <span className={css.start}>
          <Button
            variant="outline"
            size="xs"
            icon="plus"
            onClick={() => onChange([...pairs, { key: "", value: "" }])}
          >
            {addLabel}
          </Button>
        </span>
      </Stack>
    </Field>
  );
};

export const TextListField = ({
  name,
  label,
  values,
  onChange,
  placeholder,
  addLabel
}: {
  name: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  addLabel: string;
}) => (
  <Field name={name} label={label} group>
    <Stack gap={8}>
      {values.map((value, index) => (
        <div className={css.listRow} key={`${name}-${index + 1}`}>
          <Textarea
            mono
            rows={4}
            aria-label={`${label} ${index + 1}`}
            placeholder={placeholder}
            value={value}
            onChange={(event) =>
              onChange(values.map((item, i) => (i === index ? event.target.value : item)))
            }
          />
          <Button
            variant="ghost"
            size="icon"
            icon="x"
            iconOnly
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          >
            {`Remove ${label.toLowerCase()} ${index + 1}`}
          </Button>
        </div>
      ))}
      <span className={css.start}>
        <Button variant="outline" size="xs" icon="plus" onClick={() => onChange([...values, ""])}>
          {addLabel}
        </Button>
      </span>
    </Stack>
  </Field>
);

export const ipTagError = (tag: string) =>
  isValidIpOrCidr(tag) ? undefined : "Enter a valid IPv4, IPv6, or CIDR block";

export const Group = ({ legend, children }: { legend: string; children: ReactNode }) => (
  <FieldSet legend={legend}>
    <Stack gap={16}>{children}</Stack>
  </FieldSet>
);
