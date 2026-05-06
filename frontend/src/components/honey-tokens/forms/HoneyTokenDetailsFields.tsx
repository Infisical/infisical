import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";

import { THoneyTokenForm } from "./schemas";

export const HoneyTokenDetailsFields = () => {
  const { control } = useFormContext<THoneyTokenForm>();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-bunker-300">
        Provide a name and description for this honey token.
      </p>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldContent>
              <Input
                autoFocus
                value={value}
                onChange={onChange}
                placeholder="aws-canary-prod-key"
                isError={Boolean(error)}
              />
              {error ? (
                <FieldError>{error.message}</FieldError>
              ) : (
                <FieldDescription>Must be slug-friendly</FieldDescription>
              )}
            </FieldContent>
          </Field>
        )}
        control={control}
        name="name"
      />
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Description <span className="text-muted-foreground text-xs">(optional)</span>
            </FieldLabel>
            <FieldContent>
              <TextArea
                value={value ?? ""}
                onChange={onChange}
                placeholder="Describe where this decoy is planted and who should respond..."
                className="resize-none!"
                rows={4}
              />
              {error && <FieldError>{error.message}</FieldError>}
            </FieldContent>
          </Field>
        )}
        control={control}
        name="description"
      />
    </div>
  );
};
