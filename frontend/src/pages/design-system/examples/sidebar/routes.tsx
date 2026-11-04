import { linkOptions } from "@tanstack/react-router";

import { Sidebar, type SidebarLevel } from "@app/components/v4/ui/sidebar";

import { ExampleCell, ExampleGrid, ExampleStage } from "../../example-presentation";

const page = (group: string, component: string, label: string) => ({
  id: component,
  label,
  link: linkOptions({
    to: "/design-system/components/$group/$component",
    params: { group, component }
  })
});

const levels: SidebarLevel[] = [
  {
    id: "root",
    label: "Design system",
    sections: [
      {
        items: [
          {
            id: "overview",
            label: "Overview",
            icon: "home",
            link: linkOptions({ to: "/design-system", activeOptions: { exact: true } })
          },
          { id: "open-navigation", label: "Navigation", icon: "menu", level: "navigation" },
          { id: "open-feedback", label: "Feedback", icon: "bell", level: "feedback" }
        ]
      }
    ]
  },
  {
    id: "navigation",
    label: "Navigation",
    parent: "root",
    sections: [
      {
        label: "Navigation",
        icon: "menu",
        items: [
          page("navigation", "breadcrumb", "Breadcrumb"),
          page("navigation", "sidebar", "Sidebar"),
          page("navigation", "tabs", "Tabs"),
          page("navigation", "top-bar", "Top bar")
        ]
      }
    ]
  },
  {
    id: "feedback",
    label: "Feedback",
    parent: "root",
    sections: [
      {
        label: "Feedback",
        icon: "bell",
        items: [
          page("feedback", "alert", "Alert"),
          page("feedback", "loader", "Loader"),
          page("feedback", "toast", "Toast")
        ]
      }
    ]
  }
];

export default function Example() {
  return (
    <ExampleGrid>
      <ExampleCell label="Routed levels, the current route's level open" align="stretch">
        <ExampleStage height="app">
          <Sidebar label="Routed example" levels={levels} />
        </ExampleStage>
      </ExampleCell>
      <ExampleCell label="Routed levels in the rail" align="stretch">
        <ExampleStage height="app">
          <Sidebar label="Routed rail example" levels={levels} defaultCollapsed />
        </ExampleStage>
      </ExampleCell>
    </ExampleGrid>
  );
}
