import { Controller, useFormContext } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormControl, Switch, Tooltip } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const FlyioSyncOptionsFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.Flyio }>();

  return (
    <Controller
      name="syncOptions.autoRedeploy"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormControl className="mt-4" isError={Boolean(error?.message)} errorText={error?.message}>
          <Switch
            className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
            id="auto-redeploy-flyio"
            thumbClassName="bg-mineshaft-800"
            isChecked={value}
            onCheckedChange={onChange}
          >
            Auto Redeploy On Secret Change
            <Tooltip
              className="max-w-md"
              content={
                <p>
                  If enabled, the Fly.io app will be automatically redeployed upon secret changes to
                  ensure running machines pick up the new values.
                </p>
              }
            >
              <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
            </Tooltip>
          </Switch>
        </FormControl>
      )}
    />
  );
};
