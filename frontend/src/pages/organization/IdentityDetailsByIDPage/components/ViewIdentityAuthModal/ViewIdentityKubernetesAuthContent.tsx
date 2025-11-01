import { useMemo } from "react";
import { faBan } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { EyeIcon } from "lucide-react";

import { EmptyState, Spinner, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { gatewaysQueryKeys, useGetIdentityKubernetesAuth } from "@app/hooks/api";
import { IdentityKubernetesAuthForm } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityKubernetesAuthForm";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { ViewAuthMethodProps } from "./types";
import { ViewIdentityContentWrapper } from "./ViewIdentityContentWrapper";

export const ViewIdentityKubernetesAuthContent = ({
  identityId,
  handlePopUpToggle,
  handlePopUpOpen,
  onDelete,
  popUp
}: ViewAuthMethodProps) => {
  const { data: gateways } = useQuery(gatewaysQueryKeys.list());

  const { data, isPending } = useGetIdentityKubernetesAuth(identityId);

  const selectedGateway = useMemo(() => {
    return gateways?.find((gateway) => gateway.id === data?.gatewayId) || null;
  }, [gateways, data?.gatewayId]);

  if (isPending) {
    return (
      <div className="flex w-full items-center justify-center">
        <Spinner className="text-mineshaft-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={faBan}
        title="Could not find Kubernetes Auth associated with this Identity."
      />
    );
  }

  if (popUp.identityAuthMethod.isOpen) {
    return (
      <IdentityKubernetesAuthForm
        identityId={identityId}
        isUpdate
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
    );
  }

  return (
    <ViewIdentityContentWrapper
      onEdit={() => handlePopUpOpen("identityAuthMethod")}
      onDelete={onDelete}
      identityId={identityId}
    >
      <IdentityAuthFieldDisplay label="Access Token TTL (seconds)">
        {data.accessTokenTTL}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Access Token Max TTL (seconds)">
        {data.accessTokenMaxTTL}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Access Token Max Number of Uses">
        {data.accessTokenNumUsesLimit}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Access Token Trusted IPs">
        {data.accessTokenTrustedIps.map((ip) => ip.ipAddress).join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay
        className="col-span-2"
        label="Kubernetes Host / Base Kubernetes API URL"
      >
        {data.kubernetesHost}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Gateway">{selectedGateway?.name}</IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Token Reviewer JWT">
        {data.tokenReviewerJwt ? (
          <Tooltip
            side="right"
            className="max-w-xl p-2"
            content={
              <p className="rounded-sm bg-mineshaft-600 p-2 break-words">
                {data.tokenReviewerJwt || "Not provided"}
              </p>
            }
          >
            <Badge variant="neutral">
              <EyeIcon />
              Reveal
            </Badge>
          </Tooltip>
        ) : (
          <p className="text-base leading-4 text-bunker-400 italic">Not set</p>
        )}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Service Account Names">
        {data.allowedNames
          ?.split(",")
          .map((name) => name.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Namespaces">
        {data.allowedNamespaces
          ?.split(",")
          .map((namespace) => namespace.trim())
          .join(", ")}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Allowed Audience">
        {data.allowedAudience}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="CA Certificate">
        {data.caCert && (
          <Tooltip
            side="right"
            className="max-w-xl p-2"
            content={<p className="rounded-sm bg-mineshaft-600 p-2 break-words">{data.caCert}</p>}
          >
            <Badge variant="neutral">
              <EyeIcon />
              Reveal
            </Badge>
          </Tooltip>
        )}
      </IdentityAuthFieldDisplay>
    </ViewIdentityContentWrapper>
  );
};
