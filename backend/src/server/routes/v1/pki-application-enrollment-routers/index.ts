import { registerPkiApplicationAcmeEnrollmentRouter } from "./acme-enrollment-router";
import { registerPkiApplicationApiEnrollmentRouter } from "./api-enrollment-router";
import { registerPkiApplicationEnrollmentStateRouter } from "./enrollment-state-router";
import { registerPkiApplicationEstEnrollmentRouter } from "./est-enrollment-router";
import { registerPkiApplicationScepEnrollmentRouter } from "./scep-enrollment-router";

export const registerPkiApplicationEnrollmentRoutes = async (server: FastifyZodProvider) => {
  await registerPkiApplicationEnrollmentStateRouter(server);
  await registerPkiApplicationApiEnrollmentRouter(server);
  await registerPkiApplicationEstEnrollmentRouter(server);
  await registerPkiApplicationAcmeEnrollmentRouter(server);
  await registerPkiApplicationScepEnrollmentRouter(server);
};
