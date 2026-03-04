import { Tag } from "@app/components/v2";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";

const GenericFieldLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-sm font-medium text-mineshaft-300">{label}</p>
    <div className="text-sm text-mineshaft-300">{children}</div>
  </div>
);

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
      <GenericFieldLabel label="AWS Region">{region || "Not specified"}</GenericFieldLabel>
      <GenericFieldLabel label="Load Balancer">
        {loadBalancerArn ? getLoadBalancerName(loadBalancerArn) : "Not specified"}
      </GenericFieldLabel>
      <GenericFieldLabel label="Listeners">
        {listeners.length === 0 ? (
          <span className="text-mineshaft-400">No listeners configured</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {listeners.map((listener) => (
              <Tag key={listener.listenerArn} size="xs">
                {listener.protocol}:{listener.port}
              </Tag>
            ))}
          </div>
        )}
      </GenericFieldLabel>
    </>
  );
};
