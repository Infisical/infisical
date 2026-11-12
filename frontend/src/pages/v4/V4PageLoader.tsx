import { V4Scope } from "@infisical/cipher/scope";
import { Loader } from "@infisical/cipher/ui/loader";

import "@app/pages/v4/cipher.css";

import { useV4AppTheme } from "./useV4Theme";

export const V4PageLoader = () => (
  <V4Scope className="flex h-dvh flex-col" theme={useV4AppTheme()}>
    <Loader size="page" label="Loading" className="flex-1" />
  </V4Scope>
);
