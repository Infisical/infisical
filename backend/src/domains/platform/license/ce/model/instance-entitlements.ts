import { Plan, TPlanProps } from "./plan";

export enum InstanceType {
  OnPrem = "self-hosted",
  // Self-hosted online license: features are resolved from License Server v2.
  EnterpriseOnPrem = "enterprise-self-hosted",
  EnterpriseOnPremOffline = "enterprise-self-hosted-offline",
  Cloud = "cloud"
}

// Flags that describe the instance, not an org.
export type TInstanceFeatures = TPlanProps & {
  fips: false;
  instanceUserManagement: false;
};

export type TInstanceEntitlementsProps = {
  instanceType: InstanceType;
  // The features of the instance's own license. Self-hosted orgs get them as their plan.
  features: TInstanceFeatures;
  // The offline license's id and customer, when the instance runs on one.
  licenseId: string | null;
  customerId: string | null;
};

// What the instance itself is licensed for, read from its license key at boot.
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

  // The offline license's id, or "unknown".
  get licenseId(): string {
    return this.props.licenseId ?? "unknown";
  }

  isCloud(): boolean {
    return this.props.instanceType === InstanceType.Cloud;
  }

  isSelfHostedLicensed(): boolean {
    return (
      this.props.instanceType === InstanceType.EnterpriseOnPrem ||
      this.props.instanceType === InstanceType.EnterpriseOnPremOffline
    );
  }

  has(feature: keyof TInstanceFeatures): boolean {
    return Boolean(this.props.features[feature]);
  }

  // The plan every org gets on a self-hosted instance. It keeps the instance flags: the admin console reads
  // instanceUserManagement from the org's plan.
  plan(): Plan {
    return Plan.restore(this.props.features);
  }

  // Replaces some features in place, as the e2e suite's license overrides do.
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
