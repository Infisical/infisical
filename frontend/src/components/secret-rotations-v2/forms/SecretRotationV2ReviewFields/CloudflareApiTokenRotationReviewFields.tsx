import { useFormContext } from "react-hook-form";
import { z } from "zod";

import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
import { Badge } from "@app/components/v3";
import {
  useCloudflareConnectionListPermissionGroups,
  useCloudflareConnectionListZones
} from "@app/hooks/api/appConnections/cloudflare";

import {
  CLOUDFLARE_POLICY_EFFECT_MAP,
  CLOUDFLARE_POLICY_SCOPE_MAP,
  CloudflareApiTokenPolicyScope,
  CloudflareApiTokenRotationSchema
} from "../schemas/cloudflare-api-token-rotation-schema";
import { SecretRotationReviewSection } from "./shared";

// `watch` returns the raw form state, which holds one policy row per permission group — the schema's
// input side. See the note in CloudflareApiTokenRotationParametersFields.
type TCloudflareApiTokenForm = z.input<typeof CloudflareApiTokenRotationSchema>;

export const CloudflareApiTokenRotationReviewFields = () => {
  const { watch } = useFormContext<TCloudflareApiTokenForm>();

  const [connectionId, parameters, { tokenId, apiToken }] = watch([
    "connection.id",
    "parameters",
    "secretsMapping"
  ]);

  const { data: permissionGroups } = useCloudflareConnectionListPermissionGroups(connectionId, {
    enabled: Boolean(connectionId)
  });

  const { data: zones } = useCloudflareConnectionListZones(
    connectionId,
    { enabled: Boolean(connectionId) },
    true
  );

  const getPermissionGroupLabel = (permissionGroupId: string) =>
    permissionGroups?.find((group) => group.id === permissionGroupId)?.name ?? permissionGroupId;

  const getScopeLabel = (scope: CloudflareApiTokenPolicyScope, zoneIds?: string[]) => {
    if (scope !== CloudflareApiTokenPolicyScope.Zones) return CLOUDFLARE_POLICY_SCOPE_MAP[scope];

    return (zoneIds ?? [])
      .map((zoneId) => zones?.find((zone) => zone.id === zoneId)?.name ?? zoneId)
      .join(", ");
  };

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <ReviewField label="Token Name">{parameters.name}</ReviewField>
        <div className="grid grid-cols-2 gap-2">
          {parameters.policies.map((policy, i) => (
            <ReviewField key={`policy-${i + 1}`} label={`Policy ${i + 1}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span>{CLOUDFLARE_POLICY_EFFECT_MAP[policy.effect]}</span>
                <Badge variant="neutral">{getScopeLabel(policy.scope, policy.zoneIds)}</Badge>
                <span className="text-muted">
                  {getPermissionGroupLabel(policy.permissionGroupId)}
                </span>
              </div>
            </ReviewField>
          ))}
        </div>
        {Boolean(parameters.allowedIps?.length) && (
          <ReviewField label="Allowed IPs">{parameters.allowedIps?.join(", ")}</ReviewField>
        )}
        {Boolean(parameters.disallowedIps?.length) && (
          <ReviewField label="Disallowed IPs">{parameters.disallowedIps?.join(", ")}</ReviewField>
        )}
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <ReviewField label="Token ID">{tokenId}</ReviewField>
        <ReviewField label="API Token">{apiToken}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
