import { KeyboardEvent, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import {
  Button,
  CopyButton,
  Field,
  FieldFeedback,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useGetSshCaPublicKey } from "@app/hooks/api";
import { sshCertKeyAlgorithms } from "@app/hooks/api/dynamicSecret/constants";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { getAuthToken } from "@app/hooks/api/reactQuery";

import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { defineDynamicSecretProvider, TDynamicSecretProviderRendererProps } from "../types";
import {
  getSshCreateDefaultValues,
  getSshCreatePayload,
  getSshEditDefaultValues,
  getSshEditPayload,
  SSH_CUSTOM_RENDERER_REASONS,
  sshCreateFormSchema,
  sshEditFormSchema,
  TSshFormValues
} from "./sshContract";

const SshFields = ({ context, mode }: TDynamicSecretProviderRendererProps) => {
  const { control, setValue, watch } = useFormContext<TSshFormValues>();
  const [principal, setPrincipal] = useState("");
  const principals = watch("inputs.principals");
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const dynamicSecretId =
    mode === "edit" && "dynamicSecret" in context ? context.dynamicSecret.id : "";
  const { data: caPublicKey } = useGetSshCaPublicKey({
    dynamicSecretId,
    enabled: mode === "edit" && isSetupOpen
  });
  const setupCommand = dynamicSecretId
    ? `curl -H "Authorization: Bearer ${getAuthToken()}" "${window.location.origin}/api/v1/dynamic-secrets/ssh-ca-setup/${dynamicSecretId}" | sudo bash`
    : "";
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
    <>
      <DynamicSecretProviderGroup id="ssh-configuration" presentation="panel">
        <Controller
          control={control}
          name="inputs.principals"
          render={({ fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="ssh-principal">Allowed Principals</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="ssh-principal"
                  value={principal}
                  onChange={(event) => setPrincipal(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter principal name..."
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addPrincipal}
                  isDisabled={!principal.trim()}
                >
                  <PlusIcon /> Add
                </Button>
              </div>
              <FieldFeedback
                id="ssh-principals-feedback"
                description="The usernames this dynamic secret can issue certificates for."
                error={error?.message}
              />
              <div className="flex flex-col gap-2">
                {principals.map((value, index) => (
                  <div key={value} className="flex items-center gap-2">
                    <Input value={value} readOnly aria-label={`Principal ${value}`} />
                    <IconButton
                      type="button"
                      variant="outline"
                      aria-label={`Remove principal ${value}`}
                      onClick={() =>
                        setValue(
                          "inputs.principals",
                          principals.filter((_, itemIndex) => itemIndex !== index),
                          { shouldValidate: true, shouldDirty: true }
                        )
                      }
                    >
                      <Trash2Icon />
                    </IconButton>
                  </div>
                ))}
              </div>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="inputs.keyAlgorithm"
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="ssh-key-algorithm">Key Algorithm</FieldLabel>
              <Select
                value={field.value}
                onValueChange={(value) => {
                  if (!value || value === field.value) return;
                  field.onChange(value);
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  id="ssh-key-algorithm"
                  onBlur={field.onBlur}
                  isError={Boolean(error)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sshCertKeyAlgorithms.map((algorithm) => (
                    <SelectItem key={algorithm.value} value={algorithm.value}>
                      {algorithm.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldFeedback
                id="ssh-key-algorithm-feedback"
                description="Algorithm for ephemeral key pairs generated per lease."
                error={error?.message}
              />
            </Field>
          )}
        />
      </DynamicSecretProviderGroup>

      {mode === "edit" && (
        <DynamicSecretProviderGroup
          id="ssh-setup"
          presentation="collapse"
          title="Certificate-Based Authentication"
          open={isSetupOpen}
          onOpenChange={setIsSetupOpen}
        >
          <Field>
            <FieldLabel htmlFor="ssh-setup-command">Setup Command</FieldLabel>
            <div className="flex gap-2">
              <Input id="ssh-setup-command" value={setupCommand} readOnly />
              <CopyButton value={setupCommand} ariaLabel="Copy setup command" />
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="ssh-ca-public-key">CA Public Key</FieldLabel>
            <div className="flex gap-2">
              <Input id="ssh-ca-public-key" type="password" value={caPublicKey ?? ""} readOnly />
              <CopyButton value={caPublicKey ?? ""} ariaLabel="Copy CA public key" />
            </div>
          </Field>
        </DynamicSecretProviderGroup>
      )}
    </>
  );
};

export const sshDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Ssh,
  label: "SSH",
  customRenderer: { reasons: SSH_CUSTOM_RENDERER_REASONS, Component: SshFields },
  create: {
    schema: sshCreateFormSchema,
    getDefaultValues: getSshCreateDefaultValues,
    toPayload: getSshCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: sshEditFormSchema,
    getDefaultValues: getSshEditDefaultValues,
    toPayload: getSshEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});
