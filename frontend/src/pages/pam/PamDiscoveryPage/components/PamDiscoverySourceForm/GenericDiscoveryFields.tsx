import { Controller, useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { gatewaysQueryKeys } from "@app/hooks/api";

export const genericDiscoveryFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  gatewayId: z.string().min(1, "Gateway is required"),
  schedule: z.string().default("manual")
});

export const GenericDiscoveryFields = () => {
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

  const { control } = useFormContext<{ name: string; gatewayId: string; schedule: string }>();

  return (
    <>
      <Controller
        name="name"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl errorText={error?.message} isError={Boolean(error?.message)} label="Name">
            <Input autoFocus placeholder="my-discovery-source" {...field} />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="gatewayId"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error?.message)} errorText={error?.message} label="Gateway">
            <Select
              value={value || (null as unknown as string)}
              onValueChange={onChange}
              className="w-full border border-mineshaft-500"
              dropdownContainerClassName="max-w-none"
              isLoading={isGatewaysLoading}
              placeholder="Select a Gateway..."
              position="popper"
            >
              {(gateways || []).map((el) => (
                <SelectItem value={el.id} key={el.id}>
                  {el.name}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="schedule"
        render={({ field: { value, onChange } }) => (
          <FormControl label="Schedule">
            <Select
              value={value}
              onValueChange={onChange}
              className="w-full border border-mineshaft-500"
              position="popper"
            >
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </Select>
          </FormControl>
        )}
      />
    </>
  );
};
