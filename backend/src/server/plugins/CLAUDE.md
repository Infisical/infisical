# Server Plugins

Key plugins in `src/server/plugins/`:
- `error-handler.ts` — global error handling with OpenTelemetry metrics
- `fastify-zod.ts` — in-house Zod-to-OpenAPI transformation
- `audit-log.ts` — request audit logging to queue
- `api-metrics.ts` — OpenTelemetry metrics collection
- `inject-rate-limits.ts` — per-route rate limiting
- `secret-scanner.ts` / `secret-scanner-v2.ts` — secret scanning webhooks
- `serve-ui.ts` — frontend asset serving
- `swagger.ts` — Swagger/OpenAPI UI
- `maintenanceMode.ts` — maintenance mode middleware
- `ip.ts` — IP extraction and validation
