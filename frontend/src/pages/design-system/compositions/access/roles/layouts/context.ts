import { createContext, useContext } from "react";

export type PolicyLayout = "accordion" | "matrix" | "master" | "rules";

export const policyLayouts: { value: PolicyLayout; label: string }[] = [
  { value: "accordion", label: "Accordion, as on main" },
  { value: "matrix", label: "A. Permission matrix" },
  { value: "master", label: "B. Master-detail" },
  { value: "rules", label: "C. Rule list" }
];

export const PolicyLayoutContext = createContext<PolicyLayout>("accordion");
export const usePolicyLayout = () => useContext(PolicyLayoutContext);
