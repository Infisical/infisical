import { Controller, useFormContext } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormControl, Switch, Tooltip } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const CoolifySyncOptionsFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.Coolify }>();

  return (
    <Controller
      name="syncOptions.autoRedeployServices"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormControl className="mt-4" isError={Boolean(error?.message)} errorText={error?.message}>
          <Switch
            className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
            id="auto-redeploy-services"
            thumbClassName="bg-mineshaft-800"
            isChecked={value}
            onCheckedChange={onChange}
          >
            Auto Redeploy Services On Sync
            <Tooltip
              className="max-w-md"
              content={
                <p>
                  If enabled, applications will be automatically redeployed upon secret changes.
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
