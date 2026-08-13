import { createContext, useContext } from "react";

/**
 * Which principal node is open, as the panel sees it.
 *
 * Deliberately not React Flow's `selected` prop: React Flow owns selection in its own store, and a node it
 * has marked selected stays selected even when a new `nodes` array says otherwise.
 *
 * A context rather than node `data` so that selecting a node does not rebuild every node object.
 */
export const SelectedPrincipalContext = createContext<string | undefined>(undefined);

export const useIsNodeSelected = (nodeId: string) =>
  useContext(SelectedPrincipalContext) === nodeId;

export type TPrincipalActions = {
  accessHref: string;
  roleHref: (roleSlug: string) => string;
  onClose: () => void;
};

/**
 * The popover's navigation targets and its dismissal.
 *
 * These used to travel inside node `data`, which silently broke the close button: React Flow keeps the node
 * objects it was first given, so `data.popover.onClose` stayed bound to a panel instance that no longer
 * existed and calling it set state on nothing. Handlers reach the node through context, where they are always
 * the live ones; `data` is for values that describe the node.
 */
export const PrincipalActionsContext = createContext<TPrincipalActions | undefined>(undefined);

export const usePrincipalActions = () => useContext(PrincipalActionsContext);
