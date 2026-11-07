import { useState } from "react";
import { linkOptions } from "@tanstack/react-router";

import { Breadcrumb } from "@app/components/v4/ui/breadcrumb";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [org, setOrg] = useState("acme");
  const [project, setProject] = useState("payments");
  const [environment, setEnvironment] = useState("prod");
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
            {
              label: org === "acme" ? "Acme Corp" : "Globex",
              link: linkOptions({
                to: "/design-system/components/$group/$component",
                params: { group: "navigation", component: "breadcrumb" }
              }),
              switcher: {
                label: "Switch organization",
                value: org,
                options: [
                  { value: "acme", label: "Acme Corp" },
                  { value: "globex", label: "Globex" }
                ],
                onChange: setOrg,
                actions: [
                  {
                    label: "Organization settings",
                    link: linkOptions({
                      to: "/design-system/components/$group/$component",
                      params: { group: "navigation", component: "top-bar" }
                    })
                  }
                ]
              }
            },
            { label: "Secrets Management" },
            {
              label: project,
              mono: true,
              href: "#breadcrumb",
              switcher: {
                label: "Switch project",
                value: project,
                options: [
                  { value: "payments", label: "payments", mono: true },
                  { value: "platform", label: "platform", mono: true }
                ],
                onChange: setProject
              }
            },
            {
              label: environment === "prod" ? "Production" : "Staging",
              switcher: {
                label: "Switch environment",
                value: environment,
                options: [
                  { value: "staging", label: "Staging" },
                  { value: "prod", label: "Production" }
                ],
                onChange: setEnvironment
              }
            },
            { label: "Secrets" }
          ]}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
