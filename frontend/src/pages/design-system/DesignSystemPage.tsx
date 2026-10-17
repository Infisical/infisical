import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v4/ui/card";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { Input } from "@app/components/v4/ui/input";
import { Switch } from "@app/components/v4/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v4/ui/tabs";

import { primitives } from "./primitives";

import "@app/components/v4/v4.css";

const sections = [
  { href: "#introduction", label: "Introduction" },
  { href: "#components", label: "Components" },
  { href: "#theming", label: "Theming" }
];

export const DesignSystemPage = () => {
  const [corners, setCorners] = useState<"square" | "soft">("square");
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark"
  );
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <div
      className="v4 flex h-svh flex-col overflow-hidden"
      data-corners={corners === "soft" ? "soft" : undefined}
    >
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-border px-4 lg:h-16">
        <Link to="/design-system" className="text-sm font-medium text-foreground">
          Infisical
        </Link>
        <nav className="hidden items-center gap-4 text-sm text-v4-muted md:flex">
          <a href="#introduction" className="text-foreground">
            Docs
          </a>
          <a href="#components">Components</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCorners(corners === "square" ? "soft" : "square")}
          >
            {corners === "square" ? "Square" : "Soft"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              document.documentElement.dataset.theme = nextTheme;
              document.documentElement.style.colorScheme = nextTheme;
              setTheme(nextTheme);
            }}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar px-4 py-4 lg:block">
          <ul className="flex flex-col">
            {sections.map((section) => (
              <li key={section.href}>
                <a
                  href={section.href}
                  className="flex h-[30px] items-center rounded-md px-2 text-[0.8rem] font-medium text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-6 px-2 text-[0.8rem] font-medium text-v4-muted">Components</p>
          <ul className="mt-1 flex flex-col">
            {primitives.map((name) => (
              <li key={name}>
                <a
                  href={`#${name}`}
                  className="flex h-[30px] items-center rounded-md px-2 text-[0.8rem] font-medium text-sidebar-foreground capitalize hover:bg-sidebar-accent"
                >
                  {name.replaceAll("-", " ")}
                </a>
              </li>
            ))}
          </ul>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 lg:py-8">
          <article className="mx-auto max-w-[40rem]">
            <h1 id="introduction" className="text-3xl font-semibold tracking-tight">
              Introduction
            </h1>
            <p className="mt-2 text-v4-muted md:max-w-[80%]">
              Infisical 2.0 components. The page chrome follows the shadcn docs layout. Color, type,
              and corners come from the Infisical tokens.
            </p>
            <section id="components" className="mt-10">
              <h2 className="text-2xl font-semibold tracking-tight">Button</h2>
              <p className="mt-2 text-sm text-v4-muted">
                Radix button, ink primary, 36px default height.
              </p>
              <div
                id="button"
                className="mt-4 mb-12 flex h-72 items-center justify-center gap-3 rounded-2xl border border-border p-10"
              >
                <Button type="button">Save</Button>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
                <Button type="button" variant="destructive">
                  Delete
                </Button>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">Field</h2>
              <div
                id="input"
                className="mt-4 mb-12 flex h-72 flex-col items-stretch justify-center gap-4 rounded-2xl border border-border p-10"
              >
                <Input placeholder="Project name" aria-label="Project name" />
                <div className="flex items-center gap-3 text-sm">
                  <Checkbox aria-label="Remember this device" />
                  <span>Remember this device</span>
                  <Switch aria-label="Enable sync" />
                </div>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">Card</h2>
              <div id="card" className="mt-4 mb-12 rounded-2xl border border-border p-10">
                <Card>
                  <CardHeader>
                    <CardTitle>Secrets Management</CardTitle>
                    <CardDescription>
                      Centralize secrets across environments with automatic syncs.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Badge>12,480 secrets</Badge>
                      <Badge variant="secondary">46 environments</Badge>
                    </div>
                  </CardContent>
                </Card>
                <Alert className="mt-4">
                  <AlertTitle>Preview</AlertTitle>
                  <AlertDescription>
                    This route is fenced. Product pages do not import v4.
                  </AlertDescription>
                </Alert>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">Tabs</h2>
              <div id="tabs" className="mt-4 mb-12 rounded-2xl border border-border p-10">
                <Tabs defaultValue="preview">
                  <TabsList>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                    <TabsTrigger value="code">Code</TabsTrigger>
                  </TabsList>
                  <TabsContent value="preview">
                    <p className="pt-4 text-sm text-v4-muted">
                      Preview and code sit in the same frame as the shadcn component page.
                    </p>
                  </TabsContent>
                  <TabsContent value="code">
                    <p className="pt-4 font-mono text-sm">
                      npx shadcn@latest add @infisical/button
                    </p>
                  </TabsContent>
                </Tabs>
              </div>
            </section>
            <section id="theming">
              <h2 className="text-2xl font-semibold tracking-tight">Installed primitives</h2>
              <p className="mt-2 text-sm text-v4-muted">
                {primitives.length} Radix primitives. Components that require React 19 are not in
                this slice.
              </p>
              <ul className="mt-4 grid grid-cols-2 gap-2">
                {primitives.map((name) => (
                  <li key={name}>
                    <a
                      href={`#${name}`}
                      className="flex h-[30px] items-center rounded-md px-2 text-sm capitalize hover:bg-muted"
                    >
                      {name.replaceAll("-", " ")}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </article>
        </main>
      </div>
    </div>
  );
};
