import { InjectOptions, LightMyRequestResponse } from "fastify";

// The request is sent when the helper is called, not when the chain is awaited, so a call that is
// neither awaited nor `.expect()`ed still reaches the server. A lazy chain would make that line a
// silent no-op, and nothing in the eslint config catches a floating thenable.
export type TRequestChain<T> = PromiseLike<T> & {
  expect: (assert: (res: LightMyRequestResponse) => void) => Promise<LightMyRequestResponse>;
  raw: () => Promise<LightMyRequestResponse>;
};

export const request = <T>(opts: InjectOptions, parse: (res: LightMyRequestResponse) => T): TRequestChain<T> => {
  const sent = testServer.inject(opts);

  return {
    then: (onFulfilled, onRejected) => sent.then(parse).then(onFulfilled, onRejected),
    expect: async (assert) => {
      const res = await sent;
      assert(res);
      return res;
    },
    raw: () => sent
  };
};
