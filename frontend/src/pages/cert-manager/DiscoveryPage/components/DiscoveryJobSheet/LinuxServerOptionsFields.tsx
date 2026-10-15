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
import { MAX_FOLDER_DEPTH } from "@app/helpers/pkiDiscovery";

import { TLinuxServerDiscoveryJobForm } from "./discovery-job-form-schema";

export const LinuxServerOptionsFields = () => {
  const { control } = useFormContext<TLinuxServerDiscoveryJobForm>();

  return (
    <>
      <Controller
        control={control}
        name="maxFolderDepth"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>Folder Depth</FieldLabel>
            <Input
              type="number"
              min={1}
              max={MAX_FOLDER_DEPTH}
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
              isError={Boolean(error)}
            />
            {!error?.message && (
              <FieldDescription>
                How many subfolders deep to search. 1 checks only the files directly inside each
                search folder.
              </FieldDescription>
            )}
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="importStandaloneCaCertificates"
        render={({ field: { value, onChange } }) => (
          <Field orientation="horizontal" className="mb-4">
            <FieldContent>
              <Label htmlFor="import-standalone-ca">Include trust stores and CA bundles</Label>
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
