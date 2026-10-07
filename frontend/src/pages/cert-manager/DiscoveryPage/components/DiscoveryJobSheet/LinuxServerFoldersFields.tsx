import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel, TagsInput } from "@app/components/v3";

import {
  MAX_SEARCH_FOLDERS,
  MAX_SKIP_FOLDERS,
  TLinuxServerDiscoveryJobForm,
  validateLinuxFolder
} from "./discovery-job-form-schema";

const FolderListField = ({
  name,
  label,
  description,
  placeholder,
  maxFolders
}: {
  name: "searchFolderPaths" | "skipFolderPaths";
  label: string;
  description: string;
  placeholder: string;
  maxFolders: number;
}) => {
  const { control } = useFormContext<TLinuxServerDiscoveryJobForm>();
  const [tagError, setTagError] = useState<string | null>(null);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const message = tagError ?? error?.message;
        return (
          <Field className="mb-4">
            <FieldLabel>{label}</FieldLabel>
            <TagsInput
              value={value ?? []}
              onValueChange={onChange}
              validateTag={(tag, existing) => {
                if (existing.includes(tag)) return "This folder is already in the list";
                if (existing.length >= maxFolders)
                  return `Add up to ${maxFolders} ${label.toLowerCase()}`;
                return validateLinuxFolder(tag);
              }}
              onValidationError={setTagError}
              placeholder={placeholder}
              isError={Boolean(message)}
              className="font-mono"
            />
            {message ? (
              <FieldError>{message}</FieldError>
            ) : (
              <FieldDescription>{description}</FieldDescription>
            )}
          </Field>
        );
      }}
    />
  );
};

export const LinuxServerFoldersFields = () => (
  <>
    <FolderListField
      name="searchFolderPaths"
      label="Search Folders"
      placeholder="Add a folder and press Enter"
      description="Absolute paths searched on every server. Subfolders are included."
      maxFolders={MAX_SEARCH_FOLDERS}
    />
    <FolderListField
      name="skipFolderPaths"
      label="Skip Folders"
      placeholder="Add a folder and press Enter"
      description="Folders left out of the search. /proc, /sys and /dev are always skipped."
      maxFolders={MAX_SKIP_FOLDERS}
    />
  </>
);
