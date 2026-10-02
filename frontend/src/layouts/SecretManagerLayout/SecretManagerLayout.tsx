import { createContext, useContext, useState } from "react";
import { Outlet } from "@tanstack/react-router";

const SecretManagerScrollContainerContext = createContext<HTMLDivElement | null>(null);

export const useSecretManagerScrollContainer = () =>
  useContext(SecretManagerScrollContainerContext);

export const SecretManagerLayout = () => {
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);

  return (
    <div className="flex h-full w-full flex-col overflow-x-hidden">
      <div
        ref={setScrollContainer}
        className="flex-1 overflow-x-hidden overflow-y-auto p-6 md:p-10"
      >
        <SecretManagerScrollContainerContext.Provider value={scrollContainer}>
          <Outlet />
        </SecretManagerScrollContainerContext.Provider>
      </div>
    </div>
  );
};
