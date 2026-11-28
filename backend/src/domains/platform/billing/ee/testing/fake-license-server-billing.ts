/* eslint-disable class-methods-use-this */
import { TLicenseServerBilling } from "@app/domains/platform/license/ce/module";

type TBilling = TLicenseServerBilling;

type TResultOf<K extends keyof TBilling> = TBilling[K] extends (...args: never[]) => Promise<infer R> ? R : never;

type TMethod = Exclude<keyof TBilling, "isEnabled">;

const notScripted = (method: string) =>
  new Error(`FakeLicenseServerBilling.${method} was called but the test did not script it`);

// The License Server's billing endpoints. Reads answer as an org with nothing (no subscription, empty catalog);
// a mutation must be scripted with `answer`, so a test never charges by accident. Every call is recorded.
export class FakeLicenseServerBilling implements TBilling {
  // Each call in order: the method and the arguments after the org id.
  calls: { method: TMethod; orgId: string; args: unknown[] }[] = [];

  private readonly answers = new Map<TMethod, unknown>();

  private readonly failures = new Map<TMethod, Error>();

  answer<K extends TMethod>(method: K, result: TResultOf<K>): this {
    this.answers.set(method, result);
    return this;
  }

  fail(method: TMethod, error: Error): this {
    this.failures.set(method, error);
    return this;
  }

  callsTo(method: TMethod) {
    return this.calls.filter((call) => call.method === method);
  }

  isEnabled = () => true;

  getEntitlements: TBilling["getEntitlements"] = (org) => this.respond("getEntitlements", org.id, [org], null);

  getCatalog: TBilling["getCatalog"] = (orgId) => this.respond("getCatalog", orgId, [], null);

  getSubscription: TBilling["getSubscription"] = (orgId) => this.respond("getSubscription", orgId, [], null);

  getCloudPlan: TBilling["getCloudPlan"] = (orgId) => this.respond("getCloudPlan", orgId, [], null);

  getBillingProfile: TBilling["getBillingProfile"] = (orgId) => this.respond("getBillingProfile", orgId, [], null);

  getTrials: TBilling["getTrials"] = (orgId) => this.respond("getTrials", orgId, [], { trials: [] });

  createPortal: TBilling["createPortal"] = (orgId, payload) => this.respond("createPortal", orgId, [payload]);

  previewSubscriptionChange: TBilling["previewSubscriptionChange"] = (orgId, payload) =>
    this.respond("previewSubscriptionChange", orgId, [payload]);

  buyProduct: TBilling["buyProduct"] = (orgId, payload) => this.respond("buyProduct", orgId, [payload]);

  removeProduct: TBilling["removeProduct"] = (orgId, productId) => this.respond("removeProduct", orgId, [productId]);

  upgradeProduct: TBilling["upgradeProduct"] = (orgId, payload) => this.respond("upgradeProduct", orgId, [payload]);

  changeCommitments: TBilling["changeCommitments"] = (orgId, payload) =>
    this.respond("changeCommitments", orgId, [payload]);

  startTrial: TBilling["startTrial"] = (orgId, payload) => this.respond("startTrial", orgId, [payload]);

  cancelTrial: TBilling["cancelTrial"] = (orgId, payload) => this.respond("cancelTrial", orgId, [payload]);

  confirmTrialPayment: TBilling["confirmTrialPayment"] = (orgId, payload) =>
    this.respond("confirmTrialPayment", orgId, [payload]);

  private async respond<K extends TMethod>(
    method: K,
    orgId: string,
    args: unknown[],
    ...fallback: [TResultOf<K>?]
  ): Promise<TResultOf<K>> {
    this.calls.push({ method, orgId, args });
    const failure = this.failures.get(method);
    if (failure) throw failure;
    if (this.answers.has(method)) return this.answers.get(method) as TResultOf<K>;
    if (fallback.length) return fallback[0] as TResultOf<K>;
    throw notScripted(method);
  }
}
