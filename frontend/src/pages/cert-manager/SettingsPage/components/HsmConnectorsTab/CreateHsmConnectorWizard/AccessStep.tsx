import { Controller, useForm } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input
} from "@app/components/v3";

import { AccessForm } from "./schemas";

type Props = { form: ReturnType<typeof useForm<AccessForm>> };

export const AccessStep = ({ form }: Props) => (
  <FieldGroup>
    <Controller
      name="slotLabel"
      control={form.control}
      render={({ field, fieldState: { error } }) => (
        <Field>
          <FieldLabel>
            Slot label <span className="text-danger">*</span>
          </FieldLabel>
          <FieldContent>
            <Input {...field} placeholder="fortanix-prod" isError={Boolean(error)} />
            <FieldDescription>
              The PKCS#11 token label of the slot Infisical will use on the HSM. Ask your HSM
              administrator if you are not sure.
            </FieldDescription>
            <FieldError errors={[error]} />
          </FieldContent>
        </Field>
      )}
    />

    <Controller
      name="pin"
      control={form.control}
      render={({ field, fieldState: { error } }) => (
        <Field>
          <FieldLabel>
            PIN <span className="text-danger">*</span>
          </FieldLabel>
          <FieldContent>
            <Input
              {...field}
              type="password"
              placeholder="Enter the slot PIN"
              autoComplete="new-password"
              isError={Boolean(error)}
            />
            <FieldDescription>
              The PIN Infisical uses to log in to that slot through the Gateway.
            </FieldDescription>
            <FieldError errors={[error]} />
          </FieldContent>
        </Field>
      )}
    />

    <Controller
      name="keyNamePrefix"
      control={form.control}
      render={({ field, fieldState: { error } }) => (
        <Field>
          <FieldLabel>Key label prefix</FieldLabel>
          <FieldContent>
            <Input
              {...field}
              value={field.value ?? ""}
              placeholder="infisical-"
              isError={Boolean(error)}
            />
            <FieldDescription>
              Prepended to the label of every key Infisical creates on this HSM. Makes them easy to
              identify in your HSM tooling.
            </FieldDescription>
            <FieldError errors={[error]} />
          </FieldContent>
        </Field>
      )}
    />
  </FieldGroup>
);
