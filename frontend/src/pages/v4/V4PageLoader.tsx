import { useTheme } from "@app/components/v3/platform/ThemeProvider/ThemeProvider";
import { V4Scope } from "@app/components/v4/scope";
import { Loader } from "@app/components/v4/ui/loader";
import "@app/components/v4/v4.css";

export const V4PageLoader = () => {
  const { resolvedTheme } = useTheme();
  return (
    <V4Scope className="flex h-dvh flex-col" theme={resolvedTheme}>
      <Loader size="page" label="Loading" className="flex-1" />
    </V4Scope>
  );
};
