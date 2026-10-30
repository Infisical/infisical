import { Label, RadioGroup, RadioGroupItem } from "@app/components/v3";
import { SecretFolderRole } from "@app/hooks/api/folderAccess";

import { FOLDER_ROLE_TIERS } from "./folder-access.const";

type Props = {
  value: SecretFolderRole;
  onValueChange: (value: SecretFolderRole) => void;
};

export const FolderTierRadioGroup = ({ value, onValueChange }: Props) => (
  <RadioGroup value={value} onValueChange={(next) => onValueChange(next as SecretFolderRole)}>
    {FOLDER_ROLE_TIERS.map((option) => (
      <Label
        key={option.value}
        htmlFor={`folder-tier-${option.value}`}
        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
          value === option.value ? "border-project/35 bg-project/5" : "border-border bg-card"
        }`}
      >
        <RadioGroupItem
          id={`folder-tier-${option.value}`}
          value={option.value}
          className="mt-0.5"
        />
        <span className="space-y-0.5">
          <span className="block text-sm font-medium text-foreground">{option.label}</span>
          <span className="block text-xs leading-relaxed text-muted">{option.description}</span>
        </span>
      </Label>
    ))}
  </RadioGroup>
);
