import { Controller, useFormContext } from "react-hook-form";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  FormControl,
  Input,
  SecretInput
} from "@app/components/v2";

export const SqlRotateAccountFields = () => {
  const { control } = useFormContext();

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="advance-settings" className="data-[state=open]:border-none">
        <AccordionTrigger className="h-fit flex-none pl-1 text-sm">
          <div className="order-1 ml-3">Credential Rotation Account</div>
        </AccordionTrigger>
        <AccordionContent childrenClassName="px-0 py-0">
          <p className="mb-2 text-xs">
            Credentials to the high privilege account which will be used for rotating other accounts
            under this resource
          </p>
          <div className="flex gap-2">
            <Controller
              name="rotationAccountCredentials.username"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="mb-0 flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Username"
                >
                  <Input {...field} />
                </FormControl>
              )}
            />
            <Controller
              name="rotationAccountCredentials.password"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="mb-0 flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Password"
                >
                  <SecretInput
                    containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                    {...field}
                  />
                </FormControl>
              )}
            />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
