import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { TRootPkiSync } from "./common";

export type TAwsElasticLoadBalancerListener = {
  listenerArn: string;
  port?: number;
  protocol?: string;
};

export type TAwsElasticLoadBalancerPkiSync = TRootPkiSync & {
  destination: PkiSync.AwsElasticLoadBalancer;
  destinationConfig: {
    region: string;
    loadBalancerArn: string;
    listeners: TAwsElasticLoadBalancerListener[];
  };
  connection: {
    app: AppConnection.AWS;
    name: string;
    id: string;
  };
};

export type TAwsLoadBalancer = {
  loadBalancerArn: string;
  loadBalancerName: string;
  type: "application" | "network" | "gateway";
  scheme: string;
  state: string;
  vpcId?: string;
  dnsName?: string;
};

export type TAwsListener = {
  listenerArn: string;
  port: number;
  protocol: string;
  loadBalancerArn: string;
  sslPolicy?: string;
  certificates?: Array<{
    certificateArn: string;
    isDefault: boolean;
  }>;
};
