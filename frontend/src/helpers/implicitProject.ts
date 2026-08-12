/**
 * PAM and Sandbox are project-backed products whose URLs carry no `$projectId`, so their project has
 * to be resolved from the org instead. Sandbox must win on its own routes: an org that also has a PAM
 * project would otherwise resolve to PAM there and render PAM's nav and links.
 *
 * Every non-sandbox route keeps the previous PAM fallback exactly, so nothing else changes.
 */
export const resolveImplicitProjectId = (
  pathname: string,
  org: { pamProjectId?: string | null; sandboxProjectId?: string | null }
): string | null =>
  (pathname.includes("/sandboxes") ? org.sandboxProjectId : null) ?? org.pamProjectId ?? null;
