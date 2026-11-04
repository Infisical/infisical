import { Outlet } from "@tanstack/react-router";

export const SecretManagerLayout = () => {
  return (
    <div className="flex h-full w-full flex-col overflow-x-hidden">
      <div className="flex-1 overflow-x-hidden overflow-y-auto p-6 md:p-10">
        <Outlet />
      </div>
    </div>
  );
};
