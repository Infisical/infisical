import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  FormControl,
  Input
} from "@app/components/v2";

export const SqlRotateAccountFields = ({ isUpdate }: { isUpdate: boolean }) => {
  const { control } = useFormContext();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="advance-settings" className="data-[state=open]:border-none">
        <AccordionTrigger className="h-fit flex-none pl-1 text-sm">
          <div className="order-1 ml-3">Rotation Account</div>
        </AccordionTrigger>
        <AccordionContent childrenClassName="px-0 py-0">
          <p className="mb-2 text-xs">
            Credentials of the privileged account which will be used for rotating other accounts
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
                  <Input {...field} autoComplete="off" />
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
                  <Input
                    {...field}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    onFocus={() => {
                      if (isUpdate && field.value === "__INFISICAL_UNCHANGED__") {
                        field.onChange("");
                      }
                      setShowPassword(true);
                    }}
                    onBlur={() => {
                      if (isUpdate && field.value === "") {
                        field.onChange("__INFISICAL_UNCHANGED__");
                      }
                      setShowPassword(false);
                    }}
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
