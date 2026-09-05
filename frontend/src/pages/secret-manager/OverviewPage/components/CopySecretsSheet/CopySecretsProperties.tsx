import { SlidersHorizontalIcon } from "lucide-react";

import {
  Button,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";

import type { CopySecretsAttributes } from "./copySecrets.types";

const properties = [
  { key: "value", label: "Secret value", description: "Copy values where you have read access." },
  { key: "comment", label: "Comment", description: "Include the note attached to each secret." },
  { key: "tags", label: "Tags", description: "Include assigned tags." },
  { key: "metadata", label: "Metadata", description: "Include custom key/value metadata." },
  {
    key: "skipMultilineEncoding",
    label: "Multi-line encoding",
    description: "Preserve the multi-line encoding setting."
  }
] as const;

export const CopySecretsProperties = ({
  attributes,
  onChange,
  isDisabled
}: {
  attributes: CopySecretsAttributes;
  onChange: (attributes: CopySecretsAttributes) => void;
  isDisabled: boolean;
}) => (
  <Popover modal>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" size="sm" isDisabled={isDisabled}>
        <SlidersHorizontalIcon /> Properties ({Object.values(attributes).filter(Boolean).length}/5)
      </Button>
    </PopoverTrigger>
    <PopoverContent
      side="top"
      align="start"
      className="flex max-w-[calc(100vw-2rem)] flex-col gap-4"
      aria-labelledby="copy-properties-heading"
    >
      <div className="flex flex-col gap-1">
        <h3 id="copy-properties-heading" className="text-sm font-medium">
          Include Properties
        </h3>
        <p className="text-xs text-muted">
          Keys are always copied. Unselected properties keep their existing destination values, or
          use defaults for new secrets.
        </p>
      </div>
      {properties.map(({ key, label, description }) => (
        <Field key={key} orientation="horizontal">
          <Checkbox
            id={`copy-property-${key}`}
            variant="project"
            isChecked={attributes[key]}
            isDisabled={isDisabled}
            aria-describedby={`copy-property-${key}-description`}
            onCheckedChange={(checked) => onChange({ ...attributes, [key]: checked === true })}
          />
          <FieldContent>
            <Label htmlFor={`copy-property-${key}`}>{label}</Label>
            <FieldDescription id={`copy-property-${key}-description`}>
              {description}
            </FieldDescription>
          </FieldContent>
        </Field>
      ))}
    </PopoverContent>
  </Popover>
);
