import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Icon } from "@infisical/cipher/ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@infisical/cipher/ui/popover";
import { SlidersHorizontalIcon } from "lucide-react";

import type { CopySecretsAttributes } from "@app/pages/secret-manager/OverviewPage/components/CopySecretsSheet/copySecrets.types";

import styles from "./copy-secrets.module.css";

const properties: {
  key: keyof CopySecretsAttributes;
  label: string;
  description?: string;
}[] = [
  { key: "value", label: "Secret value", description: "Only values you can read are copied." },
  { key: "comment", label: "Comment" },
  { key: "tags", label: "Tags" },
  { key: "metadata", label: "Metadata" },
  { key: "skipMultilineEncoding", label: "Multi-line encoding" }
];

export function CopySecretsProperties({
  attributes,
  onChange,
  isDisabled
}: {
  attributes: CopySecretsAttributes;
  onChange: (attributes: CopySecretsAttributes) => void;
  isDisabled: boolean;
}) {
  const includedPropertyCount = Object.values(attributes).filter(Boolean).length;

  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={isDisabled}>
          <Icon icon={SlidersHorizontalIcon} />
          Properties ({includedPropertyCount}/{properties.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className={styles.properties}
        aria-labelledby="copy-properties-heading"
      >
        <PopoverHeader>
          <PopoverTitle id="copy-properties-heading">Include properties</PopoverTitle>
          <PopoverDescription>
            Keys are always copied. Unselected properties keep the destination values, or defaults
            for new secrets.
          </PopoverDescription>
        </PopoverHeader>
        {properties.map(({ key, label, description }) => (
          <Checkbox
            key={key}
            id={`copy-property-${key}`}
            label={label}
            description={description}
            checked={attributes[key]}
            disabled={isDisabled}
            onCheckedChange={(checked) => onChange({ ...attributes, [key]: checked === true })}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
