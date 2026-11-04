import { Controller, useFormContext, useWatch } from "react-hook-form";
import { BellIcon } from "lucide-react";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Toggle
} from "@app/components/v3";
import { AlertResourceType } from "@app/hooks/api/alerts";
import { ChannelsField } from "@app/views/Alerts";

import { TSecretRotationV2Form } from "./schemas";

type Props = {
  projectId: string;
  rotationId?: string;
  isAlertUnavailable: boolean;
};

export const SecretRotationV2AlertsFields = ({
  projectId,
  rotationId,
  isAlertUnavailable
}: Props) => {
  const { control, clearErrors } = useFormContext<TSecretRotationV2Form>();
  const isFailureAlertEnabled = useWatch({ control, name: "isFailureAlertEnabled" });

  if (isAlertUnavailable) {
    return (
      <p className="text-sm text-danger">
        Couldn&apos;t load this rotation&apos;s failure alert. Saving leaves it unchanged. Close and
        reopen the rotation to try again.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Controller
        control={control}
        name="isFailureAlertEnabled"
        render={({ field: { value, onChange, onBlur, ref } }) => (
          <Item variant="outline">
            <ItemMedia variant="icon">
              <BellIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle id="secret-rotation-failure-alert-title">
                Alert on Rotation Failure
              </ItemTitle>
              <ItemDescription id="secret-rotation-failure-alert-description">
                Sends a notice when a scheduled rotation fails after all of its retries.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Toggle
                ref={ref}
                variant="project"
                checked={value}
                onBlur={onBlur}
                onCheckedChange={(checked) => {
                  onChange(checked);
                  if (!checked) clearErrors("channels");
                }}
                aria-labelledby="secret-rotation-failure-alert-title"
                aria-describedby="secret-rotation-failure-alert-description"
              />
            </ItemActions>
          </Item>
        )}
      />
      {isFailureAlertEnabled ? (
        <ChannelsField
          projectId={projectId}
          resourceType={AlertResourceType.SecretRotation}
          resourceId={rotationId}
        />
      ) : (
        <p className="text-sm text-muted">
          No alert for this rotation. Admins still get an in-app notification when a scheduled
          rotation fails.
        </p>
      )}
    </div>
  );
};
