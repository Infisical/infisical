import { Controller, useFormContext, useWatch } from "react-hook-form";
import slugify from "@sindresorhus/slugify";

import { Field, FieldContent, FieldError, FieldLabel, Input, TextArea } from "@app/components/v3";
import { HONEY_TOKEN_MAP } from "@app/helpers/honeyTokens";

import { THoneyTokenForm } from "./schemas";

type Props = {
  isUpdate: boolean;
};

export const HoneyTokenDetailsFields = ({ isUpdate }: Props) => {
  const { control } = useFormContext<THoneyTokenForm>();
  const [type, environment] = useWatch({ control, name: ["type", "environment"] });

  const suggestedName =
    isUpdate || !environment?.slug
      ? ""
      : slugify(`${HONEY_TOKEN_MAP[type].name} honey token ${environment.slug}`, {
          lowercase: true,
          decamelize: false
        })
          .slice(0, 64)
          .replace(/-+$/, "");

  return (
    <div className="flex flex-col gap-4">
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldContent>
              <Input
                autoFocus
                value={value}
                onChange={onChange}
                suggestedValue={suggestedName}
                placeholder="aws-canary-prod-key"
                isError={Boolean(error)}
                autoComplete="off"
                name="honey-token-name"
              />
              {error && <FieldError>{error.message}</FieldError>}
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
