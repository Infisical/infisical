import { V4Scope } from "@app/components/v4/scope";
import { Loader } from "@app/components/v4/ui/loader";
import "@app/components/v4/v4.css";

import { useV4AppTheme } from "./useV4Theme";

export const V4PageLoader = () => (
  <V4Scope className="flex h-dvh flex-col" theme={useV4AppTheme()}>
    <Loader size="page" label="Loading" className="flex-1" />
  </V4Scope>
);
