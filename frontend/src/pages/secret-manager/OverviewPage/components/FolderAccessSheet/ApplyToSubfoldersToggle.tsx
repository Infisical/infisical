import { FolderTreeIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  Toggle
} from "@app/components/v3";

type Props = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  // only grants on the root folder may apply to subfolders
  isDisabled?: boolean;
};

export const ApplyToSubfoldersToggle = ({ checked, onCheckedChange, isDisabled }: Props) => (
  <FieldLabel htmlFor="apply-to-subfolders" variant="project">
    <Field orientation="horizontal" data-disabled={isDisabled}>
      <FieldContent>
        <FieldTitle>
          <FolderTreeIcon />
          Apply to Subfolders
        </FieldTitle>
        <FieldDescription>
          {isDisabled
            ? "Only access on / can apply to subfolders."
            : "The selected permission also applies to every folder under /."}
        </FieldDescription>
      </FieldContent>
      <Toggle
        id="apply-to-subfolders"
        variant="project"
        checked={checked}
        disabled={isDisabled}
        onCheckedChange={onCheckedChange}
      />
    </Field>
  </FieldLabel>
);
