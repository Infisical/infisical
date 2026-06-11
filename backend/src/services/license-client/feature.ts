// Features are declared as constants (see features.ts) and resolved by key against the license
// server response; the fallback is served when the server is disabled or unreachable.

export type TFeatureValue = boolean | number | string;

export interface TFeature<T extends TFeatureValue = TFeatureValue> {
  readonly key: string;
  readonly value: T;
}

export interface TLimitFeature extends TFeature<number> {
  canUse(requested?: number): Promise<boolean>;
}

export type TFeatureDescriptor<T extends TFeatureValue = TFeatureValue> = {
  readonly key: string;
  readonly fallback: T;
};

export type TLimitFeatureDescriptor = TFeatureDescriptor<number> & { readonly limit: true };

export type TFeatureResult<D extends TFeatureDescriptor> = D extends TLimitFeatureDescriptor
  ? TLimitFeature
  : D extends TFeatureDescriptor<infer T>
    ? TFeature<T>
    : never;

export const defineFeature = <T extends TFeatureValue>(key: string, fallback: T): TFeatureDescriptor<T> => ({
  key,
  fallback
});

export const defineLimitFeature = (key: string, fallback: number): TLimitFeatureDescriptor => ({
  key,
  fallback,
  limit: true
});

export type TFeatureCounterFn = (orgId: string) => Promise<number>;

export interface TLicenseClient {
  getFeature<D extends TFeatureDescriptor>(orgId: string, feature: D): Promise<TFeatureResult<D>>;
  registerCounter(feature: TLimitFeatureDescriptor, fn: TFeatureCounterFn): void;
}
