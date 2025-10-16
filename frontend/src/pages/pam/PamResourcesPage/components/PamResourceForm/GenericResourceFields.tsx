import { Controller, useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { gatewaysQueryKeys } from "@app/hooks/api";
import { slugSchema } from "@app/lib/schemas";

export const genericResourceFieldsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  gatewayId: z.string().min(1)
});

export const GenericResourceFields = () => {
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

  const { control } = useFormContext<{ name: string; gatewayId: string }>();

  return (
    <>
      <Controller
        name="name"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            helperText="Name must be slug-friendly"
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Name"
          >
            <Input autoFocus placeholder="my-resource" {...field} />
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
    </>
  );
};
