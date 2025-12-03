import { Controller, useFormContext } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormControl, Input, Switch, TextArea, Tooltip } from "@app/components/v2";

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
          name="connectionDetails.sslCertificate"
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
        <Controller
          name="connectionDetails.sslRejectUnauthorized"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error?.message)} errorText={error?.message}>
              <Switch
                className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                id="ssl-reject-unauthorized"
                thumbClassName="bg-mineshaft-800"
                isChecked={value}
                onCheckedChange={onChange}
              >
                <p className="w-38">
                  Reject Unauthorized
                  <Tooltip
                    className="max-w-md"
                    content={
                      <p>
                        If enabled, Infisical will only connect to the server if it has a valid,
                        trusted SSL certificate.
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
      </div>
    </div>
  );
};
