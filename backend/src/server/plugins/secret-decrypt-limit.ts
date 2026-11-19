import { requestContext } from "@fastify/request-context";
import { FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import {
  createSecretDecryptLease,
  releaseSecretDecryptLease,
  TCurrentSecretDecryptLease,
  TSecretDecryptLease
} from "@app/domains/platform/kms-core/ce/module";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";

export const currentSecretDecryptLease: TCurrentSecretDecryptLease = () => {
  const lease = requestContext.get(RequestContextKey.SecretDecryptLease);
  if (lease && !lease.orgId) lease.orgId = requestContext.get(RequestContextKey.OrgId);
  return lease;
};

export const secretDecryptLimit = fp(async (server) => {
  const leases = new WeakMap<FastifyRequest, TSecretDecryptLease>();

  server.addHook("onRequest", async (req) => {
    const lease = createSecretDecryptLease();
    leases.set(req, lease);
    requestContext.set(RequestContextKey.SecretDecryptLease, lease);
  });

  server.addHook("onResponse", async (req) => releaseSecretDecryptLease(leases.get(req)));
  server.addHook("onRequestAbort", async (req) => releaseSecretDecryptLease(leases.get(req)));
});
