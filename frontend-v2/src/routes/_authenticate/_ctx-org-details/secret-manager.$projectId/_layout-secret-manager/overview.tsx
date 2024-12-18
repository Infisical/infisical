import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/overview"
)({
  component: RouteComponent
});

function RouteComponent() {
  return (
    <div>
      Hello
      "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/overview"!
    </div>
  );
}
