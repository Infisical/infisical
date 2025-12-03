import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Input, Switch, TextArea } from "@app/components/v2";

export const KubernetesResourceFields = () => {
  const { control, watch } = useFormContext();

  const skipTLSVerify = watch("connectionDetails.skipTLSVerify");

  return (
    <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3">
      <div className="mt-[0.675rem] flex flex-col gap-4">
        <Controller
          name="connectionDetails.url"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Kubernetes API URL"
            >
              <Input placeholder="https://kubernetes.example.com:6443" {...field} />
            </FormControl>
          )}
        />
        <Controller
          name="connectionDetails.namespace"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Namespace"
            >
              <Input placeholder="default" {...field} />
            </FormControl>
          )}
        />
        <Controller
          name="connectionDetails.skipTLSVerify"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
              <Switch
                className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                id="skip-tls-verify"
                thumbClassName="bg-mineshaft-800"
                isChecked={value}
                onCheckedChange={onChange}
              >
                Skip TLS Verification
              </Switch>
            </FormControl>
          )}
        />
        <Controller
          name="connectionDetails.caCertificate"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              className={skipTLSVerify ? "opacity-50" : ""}
              label="CA Certificate"
              isOptional
            >
              <TextArea
                className="h-14 resize-none!"
                {...field}
                isDisabled={skipTLSVerify}
                placeholder="-----BEGIN CERTIFICATE-----..."
              />
            </FormControl>
          )}
        />
      </div>
    </div>
  );
};
