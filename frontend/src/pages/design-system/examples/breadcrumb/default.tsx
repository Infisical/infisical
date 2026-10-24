import { useState } from "react";

import { Breadcrumb } from "@app/components/v4/ui/breadcrumb";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [project, setProject] = useState("payments");
  return (
    <ExampleGrid width="full">
      <ExampleCell label="default">
        <Breadcrumb
          aria-label="Example path"
          maxItems={3}
          items={[
            { label: "Projects", href: "#breadcrumb" },
            { label: "Payments", href: "#breadcrumb" },
            { label: "Production", href: "#breadcrumb" },
            { label: "Services", href: "#breadcrumb" },
            { label: "Deployment token" }
          ]}
        />
      </ExampleCell>
      <ExampleCell label="product">
        <Breadcrumb
          aria-label="Product navigation example"
          variant="product"
          items={[
            { label: "Workspace", href: "#breadcrumb" },
            {
              label: project,
              menu: {
                label: "Switch project",
                value: project,
                options: [
                  { value: "payments", label: "Payments" },
                  { value: "platform", label: "Platform" }
                ],
                onChange: setProject
              }
            },
            { label: "Secrets" }
          ]}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
