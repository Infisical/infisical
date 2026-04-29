// Re-export the existing identity AWS auth validators so resource AWS auth uses the
// exact same allowlist parsing rules. Centralizing means K8s/relay won't drift.
export {
  validateAccountIds,
  validatePrincipalArns
} from "@app/services/identity-aws-auth/identity-aws-auth-validators";
