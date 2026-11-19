import { ReactNode } from "react";

export const PageBannerStack = ({ children }: { children: ReactNode }) => (
  <div className="flex max-h-[50dvh] thin-scrollbar w-full shrink-0 flex-col overflow-y-auto [&>*]:shrink-0">
    {children}
  </div>
);
