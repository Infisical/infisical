import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Input, Select, SelectItem, TextArea } from "@app/components/v2";

import { MCPServerCredentialMode, TAddMCPServerForm } from "./AddMCPServerForm.schema";

const CREDENTIAL_MODE_OPTIONS = [
  {
    value: MCPServerCredentialMode.SHARED,
    label: "Shared Credentials",
    description: "All users will authenticate as the same shared account"
  },
  {
    value: MCPServerCredentialMode.PERSONAL,
    label: "Personal Credentials",
    description: "Each user will authenticate with their own credentials"
  }
];

export const BasicInfoStep = () => {
  const { control, watch } = useFormContext<TAddMCPServerForm>();
  const credentialMode = watch("credentialMode");

  const selectedModeOption = CREDENTIAL_MODE_OPTIONS.find(
    (option) => option.value === credentialMode
  );

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Configure the basic information and credential mode for the MCP server.
      </p>

      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Name" isRequired isError={Boolean(error)} errorText={error?.message}>
            <Input {...field} placeholder="my-mcp-server" />
          </FormControl>
        )}
      />

      <Controller
        control={control}
        name="description"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Description"
            isOptional
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <TextArea
              {...field}
              placeholder="Enter server description"
              className="resize-none!"
              rows={3}
            />
          </FormControl>
        )}
      />

      <Controller
        control={control}
        name="url"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Endpoint URL"
            isRequired
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Input {...field} placeholder="https://mcp-server.example.com" />
          </FormControl>
        )}
      />

      <Controller
        control={control}
        name="credentialMode"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            label="Credential Mode"
            isRequired
            isError={Boolean(error)}
            errorText={error?.message}
            helperText={selectedModeOption?.description}
          >
            <Select
              value={value}
              onValueChange={onChange}
              className="w-full"
              placeholder="Select credential mode..."
            >
              {CREDENTIAL_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
    </>
  );
};
