import { Outlet } from "@tanstack/react-router";

export const SandboxLayout = () => (
  <div className="flex h-full w-full flex-col overflow-x-hidden">
    <div className="flex-1 overflow-x-hidden overflow-y-auto bg-bunker-800">
      <Outlet />
    </div>
  </div>
);
