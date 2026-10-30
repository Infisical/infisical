import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

import type { ToastItem } from "@app/components/v4/ui/toast-stack";

import {
  type AccessData,
  createData,
  LOCAL_ONLY,
  type OrgTab,
  type ProjectTab,
  type Scenario,
  type Scope
} from "./model";

export type Subject = "member" | "identity" | "groups" | "role" | "service-token";
export type Action = "read" | "create" | "edit" | "delete";

export type Detail = { label: string; mono?: boolean } & (
  | { kind: "org-member"; id: string }
  | { kind: "org-group"; id: string }
  | { kind: "org-identity"; id: string }
  | { kind: "org-role"; id: string }
  | { kind: "project-member"; id: string }
  | { kind: "project-group"; id: string }
  | { kind: "project-identity"; id: string }
  | { kind: "project-role"; id: string }
);

export type AccessNav = {
  scope: Scope;
  orgTab: OrgTab;
  projectTab: ProjectTab;
  detail?: Detail;
};

export type AccessStart = {
  nav?: Partial<AccessNav>;
  overlay?: string;
};

type AccessContextValue = {
  scenario: Scenario;
  loading: boolean;
  data: AccessData;
  update: (fn: (data: AccessData) => AccessData) => void;
  can: (scope: Scope, subject: Subject, action: Action) => boolean;
  nav: AccessNav;
  navigate: (next: Partial<AccessNav>) => void;
  startsWith: (overlay: string) => boolean;
  toast: (item: Omit<ToastItem, "id">) => void;
  saved: (title: string) => void;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
};

const AccessContext = createContext<AccessContextValue | null>(null);

export const useAccess = () => {
  const value = useContext(AccessContext);
  if (!value) throw new Error("useAccess must be used inside AccessProvider");
  return value;
};

const restricted: Record<Scope, Subject[]> = {
  org: ["groups", "role"],
  project: ["service-token", "role"]
};

export const AccessProvider = ({
  scenario,
  start,
  children
}: {
  scenario: Scenario;
  start?: AccessStart;
  children: ReactNode;
}) => {
  const [data, setData] = useState(() => createData(scenario));
  const [nav, setNav] = useState<AccessNav>({
    scope: "org",
    orgTab: "members",
    projectTab: "members",
    ...start?.nav
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const value = useMemo<AccessContextValue>(() => {
    const toast = (item: Omit<ToastItem, "id">) =>
      setToasts((current) => [...current, { ...item, id: crypto.randomUUID() }]);
    return {
      scenario,
      loading: scenario === "loading",
      data,
      update: setData,
      can: (scope, subject, action) => {
        if (scenario === "denied") return false;
        if (scenario === "restricted" && restricted[scope].includes(subject)) return false;
        if (scenario === "read-only") return action === "read";
        return true;
      },
      nav,
      navigate: (next) => setNav((current) => ({ ...current, detail: undefined, ...next })),
      startsWith: (overlay) => start?.overlay === overlay,
      toast,
      saved: (title) => toast({ tone: "ok", title, description: LOCAL_ONLY }),
      toasts,
      dismissToast: (id) => setToasts((current) => current.filter((item) => item.id !== id))
    };
  }, [scenario, start?.overlay, data, nav, toasts]);
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
};
