## 1.0.0 (July 28, 2026)
* Initial helm release for the Infisical Agent Proxy.
* Runs `infisical secrets agent-proxy start` from the `infisical/cli` image. Requires CLI v0.43.105 or newer.
* Universal Auth credentials via `auth.existingSecretRef`, or inline `auth.clientId` / `auth.clientSecret`.
* Exposes the proxy on `agentProxy.port` (default `17322`) through a ClusterIP Service.
* Optional NetworkPolicy (`networkPolicy.*`) to restrict inbound traffic to your agent pods.
* Added `extraEnv`, `extraEnvFrom`, `extraArgs`, and `extraObjects` escape hatches.
