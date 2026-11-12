import { Plan, TPlanProps } from "./plan";

export enum InstanceType {
  OnPrem = "self-hosted",
  // Self-hosted online license: features are resolved from License Server v2.
  EnterpriseOnPrem = "enterprise-self-hosted",
  EnterpriseOnPremOffline = "enterprise-self-hosted-offline",
  Cloud = "cloud"
}

export type TInstanceFeatures = TPlanProps & {
  fips: false;
  instanceUserManagement: false;
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

  get features(): TInstanceFeatures {
    return this.props.features;
  }

  get licenseId(): string {
    return this.props.licenseId ?? "unknown";
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
      features: { ...this.props.features, ...features } as TInstanceFeatures
    });
  }

  toJSON(): TInstanceEntitlementsProps {
    return this.props;
  }
}
