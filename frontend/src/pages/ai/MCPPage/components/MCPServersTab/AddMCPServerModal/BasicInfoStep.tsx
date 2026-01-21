import { Controller, useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";

import { OrgPermissionCan } from "@app/components/permissions";
import { FormControl, Input, Select, SelectItem, TextArea, Tooltip } from "@app/components/v2";
import { OrgPermissionSubjects } from "@app/context/OrgPermissionContext";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { gatewaysQueryKeys } from "@app/hooks/api";

import { MCPServerCredentialMode, TAddMCPServerForm } from "./AddMCPServerForm.schema";

const CREDENTIAL_MODE_OPTIONS = [
  {
    value: MCPServerCredentialMode.SHARED,
    label: "Shared Credentials",
    description:
      "Your credentials will be used by all connecting users - everyone will authenticate as you"
  },
  {
    value: MCPServerCredentialMode.PERSONAL,
    label: "Personal Credentials",
    description:
      "Each connecting user must provide and authenticate with their own individual credentials"
  }
];

export const BasicInfoStep = () => {
  const { control, watch } = useFormContext<TAddMCPServerForm>();
  const credentialMode = watch("credentialMode");

  const selectedModeOption = CREDENTIAL_MODE_OPTIONS.find(
    (option) => option.value === credentialMode
  );

  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

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

      <OrgPermissionCan
        I={OrgGatewayPermissionActions.AttachGateways}
        a={OrgPermissionSubjects.Gateway}
      >
        {(isAllowed) => (
          <Controller
            control={control}
            name="gatewayId"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                isError={Boolean(error?.message)}
                errorText={error?.message}
                label="Gateway"
                helperText="Select a gateway to route connections through a private network"
              >
                <Tooltip
                  isDisabled={isAllowed}
                  content="Restricted access. You don't have permission to attach gateways to resources."
                >
                  <div>
                    <Select
                      isDisabled={!isAllowed}
                      value={value ?? "__none__"}
                      onValueChange={(val) => onChange(val === "__none__" ? null : val)}
                      className="w-full border border-mineshaft-500"
                      dropdownContainerClassName="max-w-none"
                      isLoading={isGatewaysLoading}
                      placeholder="Default: Internet Gateway"
                      position="popper"
                    >
                      <SelectItem value="__none__">Internet Gateway</SelectItem>
                      {gateways?.map((el) => (
                        <SelectItem value={el.id} key={el.id}>
                          {el.name}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>
                </Tooltip>
              </FormControl>
            )}
          />
        )}
      </OrgPermissionCan>

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
              position="popper"
              dropdownContainerClassName="max-w-none"
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
