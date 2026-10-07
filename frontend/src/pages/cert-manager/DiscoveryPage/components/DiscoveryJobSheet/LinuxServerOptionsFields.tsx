import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  Toggle
} from "@app/components/v3";
import { MAX_FILE_SIZE_KB, MAX_FOLDER_DEPTH } from "@app/helpers/pkiDiscovery";

import { TLinuxServerDiscoveryJobForm } from "./discovery-job-form-schema";

const NUMBER_FIELDS = [
  {
    name: "maxFolderDepth",
    label: "Folder Depth",
    max: MAX_FOLDER_DEPTH,
    description: "How many levels below each search folder"
  },
  {
    name: "maxFileSizeKb",
    label: "Largest File (KB)",
    max: MAX_FILE_SIZE_KB,
    description: "Bigger files are skipped and listed in the scan."
  }
] as const;

export const LinuxServerOptionsFields = () => {
  const { control } = useFormContext<TLinuxServerDiscoveryJobForm>();

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4">
        {NUMBER_FIELDS.map(({ name, label, max, description }) => (
          <Controller
            key={name}
            control={control}
            name={name}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel>{label}</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  max={max}
                  value={value ?? ""}
                  onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
                  isError={Boolean(error)}
                />
                {!error?.message && <FieldDescription>{description}</FieldDescription>}
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        ))}
      </div>
      <Controller
        control={control}
        name="importStandaloneCaCertificates"
        render={({ field: { value, onChange } }) => (
          <Field orientation="horizontal" className="mb-4">
            <FieldContent>
              <Label htmlFor="import-standalone-ca">
                Import CA Certificates Found on Their Own
              </Label>
              <FieldDescription>
                A leaf certificate always comes in with its chain. Turn this on to also import CA
                certificates from files that hold no leaf, such as trust bundles.
              </FieldDescription>
            </FieldContent>
            <Toggle
              id="import-standalone-ca"
              variant="project"
              checked={value}
              onCheckedChange={onChange}
            />
          </Field>
        )}
      />
    </>
  );
};
