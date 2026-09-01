import { useFormContext } from "react-hook-form";

import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
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

  const [parameters, { accessKeyId, secretAccessKey }] = watch(["parameters", "secretsMapping"]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <ReviewField label="Token Name">{parameters.name}</ReviewField>
        <ReviewField label="Buckets">
          <div className="flex flex-wrap items-center gap-2">
            {parameters.buckets.map((bucket) => (
              <Badge key={r2BucketKey(bucket)} variant="neutral">
                {getR2BucketLabel(bucket)}
              </Badge>
            ))}
          </div>
        </ReviewField>
        <ReviewField label="Access Level">
          {CLOUDFLARE_R2_ACCESS_LEVEL_MAP[parameters.accessLevel]}
        </ReviewField>
        {Boolean(parameters.allowedIps?.length) && (
          <ReviewField label="Allowed IPs">{parameters.allowedIps?.join(", ")}</ReviewField>
        )}
        {Boolean(parameters.disallowedIps?.length) && (
          <ReviewField label="Disallowed IPs">{parameters.disallowedIps?.join(", ")}</ReviewField>
        )}
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <ReviewField label="Access Key ID">{accessKeyId}</ReviewField>
        <ReviewField label="Secret Access Key">{secretAccessKey}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
