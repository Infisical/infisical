import { ReactNode } from "react";
import { Controller, FieldPath, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  Label,
  Switch
} from "@app/components/v3";

import { TPkiSyncForm } from "../schemas/pki-sync-schema";

type Props = {
  name: FieldPath<TPkiSyncForm>;
  id: string;
  label: string;
  description: ReactNode;
  defaultChecked?: boolean;
};

export const SyncSwitchField = ({
  name,
  id,
  label,
  description,
  defaultChecked = false
}: Props) => {
  const { control } = useFormContext<TPkiSyncForm>();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <Field orientation="horizontal">
            <FieldContent>
              <Label htmlFor={id}>{label}</Label>
              <FieldDescription>{description}</FieldDescription>
            </FieldContent>
            <Switch
              id={id}
              variant="project"
              checked={(value as boolean | undefined) ?? defaultChecked}
              onCheckedChange={onChange}
            />
          </Field>
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  );
};
