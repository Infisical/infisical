import { useEffect, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  FormControl,
  Input
} from "@app/components/v2";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

export const SqlRotateAccountFields = ({ isUpdate }: { isUpdate: boolean }) => {
  const { control } = useFormContext();
  const [showPassword, setShowPassword] = useState(false);
  const password = useWatch({ control, name: "credentials.password" });

  useEffect(() => {
    if (password === UNCHANGED_PASSWORD_SENTINEL) {
      setShowPassword(false);
    }
  }, [password]);

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
                      if (isUpdate && field.value === UNCHANGED_PASSWORD_SENTINEL) {
                        field.onChange("");
                      }
                      setShowPassword(true);
                    }}
                    onBlur={() => {
                      if (isUpdate && field.value === "") {
                        field.onChange(UNCHANGED_PASSWORD_SENTINEL);
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
