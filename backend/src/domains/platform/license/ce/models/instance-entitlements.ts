import { Plan, TPlanProps } from "./plan";

export enum InstanceType {
  OnPrem = "self-hosted",
  // Self-hosted online license: features are resolved from License Server v2.
  EnterpriseOnPrem = "enterprise-self-hosted",
  EnterpriseOnPremOffline = "enterprise-self-hosted-offline",
  Cloud = "cloud"
}

// Flags that belong to the instance's license, not to an org's plan.
export enum InstanceFeature {
  Fips = "fips",
  InstanceUserManagement = "instanceUserManagement"
}

export type TInstanceFeatures = TPlanProps & {
  fips: boolean;
  instanceUserManagement: boolean;
};

export type TInstanceEntitlementsProps = {
  instanceType: InstanceType;
  features: TInstanceFeatures;
  // Only set on an offline license.
  licenseId: string | null;
  customerId: string | null;
};

export class InstanceEntitlements {
  private constructor(private readonly props: TInstanceEntitlementsProps) {}

  static restore(props: TInstanceEntitlementsProps): InstanceEntitlements {
    return new InstanceEntitlements(props);
  }

  get instanceType(): InstanceType {
    return this.props.instanceType;
  }

  get licenseId(): string {
    return this.props.licenseId ?? "unknown";
  }

  has(feature: InstanceFeature): boolean {
    return Boolean(this.props.features[feature]);
  }

  isCloud(): boolean {
    return this.props.instanceType === InstanceType.Cloud;
  }

  // Keeps the instance flags on purpose: the admin console reads instanceUserManagement from the org's plan.
  plan(): Plan {
    return Plan.restore(this.props.features);
  }

  // For the e2e suite's license overrides.
  withFeatures(features: Partial<TInstanceFeatures>): InstanceEntitlements {
    return new InstanceEntitlements({
      ...this.props,
      features: { ...this.props.features, ...features }
    });
  }

  toJSON(): TInstanceEntitlementsProps {
    return this.props;
  }
}
