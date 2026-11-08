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

  static community(): InstanceEntitlements {
    return new InstanceEntitlements({
      instanceType: InstanceType.OnPrem,
      features: InstanceEntitlements.communityFeatures(),
      licenseId: null,
      customerId: null
    });
  }

  // Infisical Cloud: every org's plan comes from the License Server, so the instance's own features are the
  // community edition's.
  static cloud(): InstanceEntitlements {
    return new InstanceEntitlements({ ...InstanceEntitlements.community().props, instanceType: InstanceType.Cloud });
  }

  static restore(props: TInstanceEntitlementsProps): InstanceEntitlements {
    return new InstanceEntitlements(props);
  }

  static communityFeatures(): TInstanceFeatures {
    return { ...Plan.community().toJSON(), fips: false, instanceUserManagement: false };
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

  // The plan every org gets on a self-hosted instance.
  plan(): Plan {
    const { fips, instanceUserManagement, ...plan } = this.props.features;
    return Plan.restore(plan);
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
