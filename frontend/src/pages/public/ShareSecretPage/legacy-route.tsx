import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/share-secret")({
  beforeLoad: () => {
    throw redirect({ to: "/shared/new", replace: true });
  }
});
