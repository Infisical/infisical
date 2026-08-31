import { createContext, useContext, useState } from "react";
import { Outlet } from "@tanstack/react-router";

import { useProjectPermission } from "@app/context";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

const SecretManagerScrollContainerContext = createContext<HTMLDivElement | null>(null);

export const useSecretManagerScrollContainer = () =>
  useContext(SecretManagerScrollContainerContext);

export const SecretManagerLayout = () => {
  const { assumedPrivilegeDetails } = useProjectPermission();
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);

  return (
    <div className="flex h-full w-full flex-col overflow-x-hidden">
      {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
      <div
        ref={setScrollContainer}
        className="flex-1 overflow-x-hidden overflow-y-auto px-12 pt-10 pb-4"
      >
        <SecretManagerScrollContainerContext.Provider value={scrollContainer}>
          <Outlet />
        </SecretManagerScrollContainerContext.Provider>
      </div>
    </div>
  );
};
