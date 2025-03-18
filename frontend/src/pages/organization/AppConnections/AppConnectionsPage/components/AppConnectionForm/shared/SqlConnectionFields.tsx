import { Controller, useFormContext } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormControl, Input, SecretInput, Switch, TextArea, Tooltip } from "@app/components/v2";

export const SqlConnectionFields = () => {
  const { control } = useFormContext();

  return (
    <>
      <div className="flex items-start gap-2">
        <Controller
          name="credentials.host"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              className="flex-1"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Host"
            >
              <Input {...field} />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.database"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              className="flex-1"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Database Name"
            >
              <Input {...field} />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.port"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              className="w-28"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Port"
            >
              <Input type="number" {...field} />
            </FormControl>
          )}
        />
      </div>
      <div className="flex items-start gap-2">
        <Controller
          name="credentials.username"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Username"
              className="flex-1"
            >
              <Input {...field} />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.password"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Password"
              className="flex-1"
            >
              <SecretInput
                containerClassName="text-gray-400 w-full group-focus-within:!border-primary-400/50 border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
            </FormControl>
          )}
        />
      </div>
      <Controller
        name="credentials.ca"
        control={control}
        shouldUnregister
        render={({ field, fieldState: { error } }) => (
          <FormControl
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="CA (SSL)"
            isOptional
          >
            <TextArea className="!resize-none" {...field} />
          </FormControl>
        )}
      />
      <Controller
        name="isPlatformManaged"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
            <Switch
              className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
              id="platform-managed"
              thumbClassName="bg-mineshaft-800"
              isChecked={value}
              onCheckedChange={onChange}
            >
              <p className="w-[8.6rem]">
                Platform Managed
                <Tooltip
                  className="max-w-md"
                  content={
                    <p>
                      If enabled, Infisical will manage the credentials of this App Connection by
                      updating the password on creation.
                    </p>
                  }
                >
                  <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
                </Tooltip>
              </p>
            </Switch>
          </FormControl>
        )}
      />
    </>
  );
};
