import { createFileRoute } from "@tanstack/react-router";

function RouteComponent() {
  return (
    <div>
      Hello
      "/_authenticate/_inject-org-details/_org-layout/cert-manager/$projectId/_cert-manager-layout/subscribers/$subscriberId"!
    </div>
  );
}

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/cert-manager/$projectId/_cert-manager-layout/subscribers/$subscriberId"
)({
  component: RouteComponent
});
