import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { DBT_PERMISSION_SET_MAP } from "../schemas/dbt-service-token-rotation-schema";
import { SecretRotationReviewSection } from "./shared";

export const DbtServiceTokenRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.DbtServiceToken;
    }
  >();

  const [parameters, { serviceToken }] = watch(["parameters", "secretsMapping"]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        {parameters.permissionGrants.map((grant, i) => (
          <GenericFieldLabel key={`grant-${i + 1}`} label={`Permission Grant ${i + 1}`}>
            <div className="flex items-center gap-2">
              <span>{DBT_PERMISSION_SET_MAP[grant.permissionSet].label}</span>
              <Badge variant={grant.projectId ? "neutral" : "info"}>
                {grant.projectId ? `Project: ${grant.projectId}` : "All Projects"}
              </Badge>
            </div>
          </GenericFieldLabel>
        ))}
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="Service Token">{serviceToken}</GenericFieldLabel>
      </SecretRotationReviewSection>
    </>
  );
};
