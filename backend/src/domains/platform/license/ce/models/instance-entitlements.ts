import { Plan, TPlanFeatures } from "./plan";

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

export type TInstanceFeatures = TPlanFeatures & {
  fips: boolean;
  instanceUserManagement: boolean;
};

export type TInstanceEntitlementsRecord = {
  instanceType: InstanceType;
  features: TInstanceFeatures;
  licenseId: string | null;
  customerId: string | null;
};

export class InstanceEntitlements {
  private constructor(
    readonly instanceType: InstanceType,
    private readonly features: TInstanceFeatures,
    // Only set on an offline license.
    private readonly offlineLicenseId: string | null,
    private readonly customerId: string | null
  ) {}

  static restore({ instanceType, features, licenseId, customerId }: TInstanceEntitlementsRecord): InstanceEntitlements {
    return new InstanceEntitlements(instanceType, features, licenseId, customerId);
  }

  get licenseId(): string {
    return this.offlineLicenseId ?? "unknown";
  }

  has(feature: InstanceFeature): boolean {
    return Boolean(this.features[feature]);
  }

  isCloud(): boolean {
    return this.instanceType === InstanceType.Cloud;
  }

  // Keeps the instance flags on purpose: the admin console reads instanceUserManagement from the org's plan.
  plan(): Plan {
    return Plan.restore(this.features);
  }

  // For the e2e suite's license overrides.
  withFeatures(features: Partial<TInstanceFeatures>): InstanceEntitlements {
    return new InstanceEntitlements(
      this.instanceType,
      { ...this.features, ...features },
      this.offlineLicenseId,
      this.customerId
    );
  }

  toJSON(): TInstanceEntitlementsRecord {
    return {
      instanceType: this.instanceType,
      features: this.features,
      licenseId: this.offlineLicenseId,
      customerId: this.customerId
    };
  }
}
