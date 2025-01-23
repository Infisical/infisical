import { faBan, faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge, EmptyState, Spinner, Tooltip } from "@app/components/v2";
import { useGetIdentityKubernetesAuth } from "@app/hooks/api";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { ViewAuthMethodProps } from "./types";
import { ViewIdentityContentWrapper } from "./ViewIdentityContentWrapper";

export const ViewIdentityKubernetesAuthContent = ({
  identityId,
  onEdit,
  onDelete
}: ViewAuthMethodProps) => {
  const { data, isPending } = useGetIdentityKubernetesAuth(identityId);

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

  return (
    <ViewIdentityContentWrapper onEdit={onEdit} onDelete={onDelete}>
      <IdentityAuthFieldDisplay
        className="col-span-2"
        label="Kubernetes Host / Base Kubernetes API URL"
      >
        {data.kubernetesHost}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay className="col-span-2" label="Token Reviewer JWT">
        <Tooltip
          side="right"
          className="max-w-xl p-2"
          content={
            <p className="break-words rounded bg-mineshaft-600 p-2">{data.tokenReviewerJwt}</p>
          }
        >
          <div className="w-min">
            <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300">
              <FontAwesomeIcon icon={faEye} />
              <span>Reveal</span>
            </Badge>
          </div>
        </Tooltip>
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
        <Tooltip
          side="right"
          className="max-w-xl p-2"
          content={<p className="break-words rounded bg-mineshaft-600 p-2">{data.caCert}</p>}
        >
          <div className="w-min">
            <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300">
              <FontAwesomeIcon icon={faEye} />
              <span>Reveal</span>
            </Badge>
          </div>
        </Tooltip>
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Access Token TLL (seconds)">
        {data.accessTokenTTL}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Access Token Max TLL (seconds)">
        {data.accessTokenMaxTTL}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Access Token Max Number of Uses">
        {data.accessTokenNumUsesLimit}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Access Token Trusted IPs">
        {data.accessTokenTrustedIps.map((ip) => ip.ipAddress).join(", ")}
      </IdentityAuthFieldDisplay>
    </ViewIdentityContentWrapper>
  );
};
