import { TTransaction } from "./transaction-runner";

export type TDomainModule<TDomain, THooks = unknown> = {
  readonly name: string;
  readonly service: TDomain;
  readonly hooks?: THooks;
  within(tx: TTransaction): TDomain;
  routes?: (server: unknown) => Promise<void>;
};
