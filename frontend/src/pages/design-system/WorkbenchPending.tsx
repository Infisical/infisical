import { useMatch } from "@tanstack/react-router";

import { Loader } from "@app/components/v4/ui/loader";

import { routePage } from "./navigation";

export const WorkbenchPending = () => {
  const match = useMatch({ strict: false });
  return (
    <Loader
      size="page"
      label={`Loading ${routePage(match.routeId, match.params)?.title ?? "the page"}`}
    />
  );
};
