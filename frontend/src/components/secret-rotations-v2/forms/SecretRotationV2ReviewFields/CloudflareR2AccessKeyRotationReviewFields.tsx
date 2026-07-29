import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { TSecretRotationV2Form } from "../schemas";
import {
  CLOUDFLARE_R2_ACCESS_LEVEL_MAP,
  getR2BucketLabel,
  r2BucketKey
} from "../schemas/cloudflare-r2-access-key-rotation-schema";
import { SecretRotationReviewSection } from "./shared";

export const CloudflareR2AccessKeyRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.CloudflareR2AccessKey;
    }
  >();

  const [parameters, { apiToken, accessKeyId, secretAccessKey }] = watch([
    "parameters",
    "secretsMapping"
  ]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <GenericFieldLabel label="Token Name">{parameters.name}</GenericFieldLabel>
        <GenericFieldLabel label="Buckets">
          <div className="flex flex-wrap items-center gap-2">
            {parameters.buckets.map((bucket) => (
              <Badge key={r2BucketKey(bucket)} variant="neutral">
                {getR2BucketLabel(bucket)}
              </Badge>
            ))}
          </div>
        </GenericFieldLabel>
        <GenericFieldLabel label="Access Level">
          {CLOUDFLARE_R2_ACCESS_LEVEL_MAP[parameters.accessLevel]}
        </GenericFieldLabel>
        {Boolean(parameters.allowedIps?.length) && (
          <GenericFieldLabel label="Allowed IPs">
            {parameters.allowedIps?.join(", ")}
          </GenericFieldLabel>
        )}
        {Boolean(parameters.disallowedIps?.length) && (
          <GenericFieldLabel label="Disallowed IPs">
            {parameters.disallowedIps?.join(", ")}
          </GenericFieldLabel>
        )}
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="Access Key ID">{accessKeyId}</GenericFieldLabel>
        <GenericFieldLabel label="Secret Access Key">{secretAccessKey}</GenericFieldLabel>
        <GenericFieldLabel label="API Token">{apiToken}</GenericFieldLabel>
      </SecretRotationReviewSection>
    </>
  );
};
