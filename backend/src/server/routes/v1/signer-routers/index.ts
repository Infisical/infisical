import { registerSignerApprovalPolicyRouter } from "./approval-policy-router";
import { registerSignerCertificateRouter } from "./certificate-router";
import { registerSignerLifecycleRouter } from "./lifecycle-router";
import { registerSignerOperationsRouter } from "./operations-router";
import { registerSignerRequestsRouter } from "./requests-router";
import { registerSignerSigningRouter } from "./signing-router";

export const registerSignerRouter = async (server: FastifyZodProvider) => {
  await registerSignerLifecycleRouter(server);
  await registerSignerSigningRouter(server);
  await registerSignerCertificateRouter(server);
  await registerSignerApprovalPolicyRouter(server);
  await registerSignerRequestsRouter(server);
  await registerSignerOperationsRouter(server);
};
