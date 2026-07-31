import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";

type ListenerConfig = {
  listenerArn: string;
  port: number;
  protocol: string;
};

type Props = {
  pkiSync: TPkiSync;
};

const getLoadBalancerName = (loadBalancerArn: string): string => {
  const parts = loadBalancerArn.split("/");
  if (parts.length >= 3) {
    return parts[2];
  }
  return loadBalancerArn;
};

export const AwsElasticLoadBalancerPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const destinationConfig = pkiSync.destinationConfig as
    | {
        region?: string;
        loadBalancerArn?: string;
        listeners?: ListenerConfig[];
      }
    | undefined;

  const region = destinationConfig?.region;
  const loadBalancerArn = destinationConfig?.loadBalancerArn;
  const listeners = destinationConfig?.listeners || [];

  return (
    <>
      <Detail>
        <DetailLabel>AWS Region</DetailLabel>
        <DetailValue>{region || "Not specified"}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Load Balancer</DetailLabel>
        <DetailValue>
          {loadBalancerArn ? getLoadBalancerName(loadBalancerArn) : "Not specified"}
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Listeners</DetailLabel>
        <DetailValue>
          {listeners.length === 0 ? (
            <span className="text-muted">No listeners configured</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {listeners.map((listener) => (
                <Badge key={listener.listenerArn} variant="neutral">
                  {listener.protocol}:{listener.port}
                </Badge>
              ))}
            </div>
          )}
        </DetailValue>
      </Detail>
    </>
  );
};
