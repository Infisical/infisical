import { FolderTreeIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  Toggle
} from "@app/components/v3";

import { normalizeFolderPath, subfolderToggleLabelOf } from "./folder-access.utils";

type Props = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  folderPath: string;
};

export const ApplyToSubfoldersToggle = ({ checked, onCheckedChange, folderPath }: Props) => (
  <FieldLabel htmlFor="apply-to-subfolders" variant="project">
    <Field orientation="horizontal">
      <FieldContent>
        <FieldTitle>
          <FolderTreeIcon />
          {subfolderToggleLabelOf(folderPath)}
        </FieldTitle>
        <FieldDescription>
          The selected permission also applies to every folder under{" "}
          {normalizeFolderPath(folderPath)}.
        </FieldDescription>
      </FieldContent>
      <Toggle
        id="apply-to-subfolders"
        variant="project"
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </Field>
  </FieldLabel>
);
