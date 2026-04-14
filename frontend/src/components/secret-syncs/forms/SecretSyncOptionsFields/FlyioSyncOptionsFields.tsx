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
                <div className="space-y-2">
                  <p>
                    If enabled, Infisical will trigger a restart of all app machines after syncing
                    or removing secrets so they pick up the new values immediately.
                  </p>
                  <p>
                    Fly.io does not expose a way to mark secrets as &quot;deployed&quot;, so the
                    Fly.io dashboard may show secrets as <strong>Staged</strong> even though they
                    are already applied. To confirm deployment, check that your machines restarted
                    after the sync (e.g. in the Fly.io Machines view or app logs).
                  </p>
                </div>
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
