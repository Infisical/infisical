import { FolderTreeIcon } from "lucide-react";

import { Field, FieldLabel, FieldTitle, Toggle } from "@app/components/v3";

type Props = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export const ApplyToSubfoldersToggle = ({ checked, onCheckedChange }: Props) => (
  <FieldLabel htmlFor="apply-to-subfolders" variant="project">
    <Field orientation="horizontal">
      <FieldTitle>
        <FolderTreeIcon />
        Apply to Subfolders
      </FieldTitle>
      <Toggle
        id="apply-to-subfolders"
        variant="project"
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </Field>
  </FieldLabel>
);
