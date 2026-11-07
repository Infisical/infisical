import { TTransaction } from "./transaction-runner";

export type TDomainModule<TService, THooks = unknown> = {
  readonly name: string;
  readonly service: TService;
  readonly hooks?: THooks;
  within(tx: TTransaction): TService;
  routes?: (server: unknown) => Promise<void>;
};
