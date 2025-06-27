import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "./SettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/ssh/_ssh-layout/access-management"
)({
  component: SettingsPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs
        // {
        //   label: "Access Control",
        //   link: linkOptions({
        //     to: "/ssh/$projectId/access-management",
        //     params: {
        //       projectId: params.projectId
        //     }
        //   })
        // }
      ]
    };
  }
});
