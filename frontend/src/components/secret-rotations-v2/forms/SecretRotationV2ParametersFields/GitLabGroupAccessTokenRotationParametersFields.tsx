import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import {
  Field,
  FieldError,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  GITLAB_GROUP_ACCESS_TOKEN_SCOPES,
  GITLAB_TOKEN_ACCESS_LEVEL_LABELS,
  GitLabTokenAccessLevel
} from "@app/hooks/api/secretRotationsV2/types/gitlab-group-access-token-rotation";

import { GitLabGroupField, GitLabTokenConnectionAlert, GitLabTokenSettingsFields } from "./shared";

export const GitLabGroupAccessTokenRotationParametersFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.GitLabGroupAccessToken;
    }
  >();

  return (
    <>
      <GitLabTokenConnectionAlert />
      <GitLabGroupField />
      <GitLabTokenSettingsFields scopes={GITLAB_GROUP_ACCESS_TOKEN_SCOPES} />
      <Controller
        name="parameters.accessLevel"
        control={control}
        defaultValue={GitLabTokenAccessLevel.Maintainer}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              id="gitlab-token-access-level-label"
              htmlFor="gitlab-token-access-level"
            >
              Role
            </FieldLabelWithTooltip>
            <Select
              value={String(value)}
              onValueChange={(nextValue) => {
                // Radix Select can emit a spurious empty onValueChange while options mount.
                if (!nextValue) return;
                onChange(Number(nextValue));
              }}
            >
              <SelectTrigger
                id="gitlab-token-access-level"
                aria-labelledby="gitlab-token-access-level-label"
                className="w-full"
                isError={Boolean(error)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {Object.entries(GITLAB_TOKEN_ACCESS_LEVEL_LABELS).map(([accessLevel, label]) => (
                  <SelectItem key={accessLevel} value={accessLevel}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
    </>
  );
};
