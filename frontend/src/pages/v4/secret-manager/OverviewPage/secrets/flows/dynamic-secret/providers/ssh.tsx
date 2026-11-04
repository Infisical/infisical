import { type KeyboardEvent, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  getSshCreateDefaultValues,
  getSshCreatePayload,
  getSshEditDefaultValues,
  getSshEditPayload,
  sshCreateFormSchema,
  sshEditFormSchema,
  TSshFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/sshContract";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import { sshCertKeyAlgorithms } from "@app/hooks/api/dynamicSecret/constants";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { fieldError, ProviderGroup } from "../fields";
import { defineFlowProvider, type DynamicSecretRendererProps } from "../types";

function SshFields({ mode }: Pick<DynamicSecretRendererProps, "mode">) {
  const { control, setValue, watch } = useFormContext<TSshFormValues>();
  const [principal, setPrincipal] = useState("");
  const principals = watch("inputs.principals");
  const addPrincipal = () => {
    const value = principal.trim();
    if (value && !principals.includes(value)) {
      setValue("inputs.principals", [...principals, value], {
        shouldValidate: true,
        shouldDirty: true
      });
    }
    setPrincipal("");
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addPrincipal();
    }
  };

  return (
    <ProviderGroup id="ssh-configuration">
      <Controller
        control={control}
        name="inputs.principals"
        render={({ fieldState: { error } }) => (
          <Stack gap={8}>
            <Field
              wide
              label="Allowed Principals"
              description="The usernames this dynamic secret can issue certificates for."
              error={fieldError(error)}
            >
              <Inline gap={8}>
                <div className="flex-1">
                  <Input
                    value={principal}
                    onChange={(event) => setPrincipal(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter principal name..."
                    invalid={Boolean(error)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  icon="plus"
                  onClick={addPrincipal}
                  disabled={!principal.trim()}
                >
                  Add
                </Button>
              </Inline>
            </Field>
            {principals.map((value, index) => (
              <Inline key={value} gap={8}>
                <div className="flex-1">
                  <Input value={value} readOnly aria-label={`Principal ${value}`} />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  icon="trash"
                  iconOnly
                  aria-label={`Remove principal ${value}`}
                  onClick={() =>
                    setValue(
                      "inputs.principals",
                      principals.filter((_, itemIndex) => itemIndex !== index),
                      { shouldValidate: true, shouldDirty: true }
                    )
                  }
                >
                  Remove principal {value}
                </Button>
              </Inline>
            ))}
          </Stack>
        )}
      />
      {(
        [
          {
            name: "inputs.keyAlgorithm",
            label: "Key Algorithm",
            description: "Algorithm for ephemeral key pairs generated per lease."
          },
          {
            name: "inputs.caKeyAlgorithm",
            label: "CA Key Algorithm",
            description:
              "Algorithm for the CA that signs lease certificates. Updating this requires hosts to be configured again."
          }
        ] as const
      ).map((definition) => (
        <Controller
          key={definition.name}
          control={control}
          name={definition.name}
          render={({ field, fieldState: { error } }) => (
            <Field
              wide
              label={definition.label}
              description={definition.description}
              error={fieldError(error)}
            >
              <Select
                value={field.value}
                invalid={Boolean(error)}
                options={sshCertKeyAlgorithms}
                onValueChange={(value) => {
                  if (!value || value === field.value) return;
                  field.onChange(value);
                }}
              />
            </Field>
          )}
        />
      ))}
      {mode === "edit" && (
        <ProviderGroup
          id="ssh-setup"
          presentation="collapse"
          title="Certificate-Based Authentication"
        >
          <Field
            wide
            label="Setup Command"
            description="No certificate authority exists in this local preview, so there is no setup command to copy."
          >
            <Input value="" readOnly disabled />
          </Field>
          <Field
            wide
            label="CA Public Key"
            description="No certificate authority exists in this local preview, so there is no public key to copy."
          >
            <Input type="password" value="" readOnly disabled />
          </Field>
        </ProviderGroup>
      )}
    </ProviderGroup>
  );
}

export const sshFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.Ssh,
  label: "SSH",
  schema: sshCreateFormSchema,
  getDefaultValues: getSshCreateDefaultValues,
  toPayload: getSshCreatePayload,
  Renderer: SshFields,
  submitLabel: "Submit",
  edit: {
    schema: sshEditFormSchema,
    getDefaultValues: getSshEditDefaultValues,
    toPayload: getSshEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});
