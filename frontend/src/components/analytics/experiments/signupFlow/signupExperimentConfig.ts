export const SIGNUP_FLOW_FEATURE_FLAG = "signup-flow";
export const SIGNUP_COMPLETED_EVENT = "Signup Flow Completed";

export enum SignupFlowVariant {
  Control = "control",
  DashboardPreview = "test"
}

export const resolveSignupFlowVariant = (value: unknown) => {
  const isAssignedVariant = Object.values(SignupFlowVariant).includes(value as SignupFlowVariant);

  return {
    variant: isAssignedVariant ? (value as SignupFlowVariant) : SignupFlowVariant.Control,
    shouldPersist: isAssignedVariant
  };
};
