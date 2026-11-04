import type { VirtualRouteNode } from "@tanstack/virtual-file-routes";

import { routes } from "../src/routes";

const productRoute =
  /^\/organizations\/\$orgId\/(projects\/(\$type|secret-management|cert-manager|kms|secret-scanning|pam|agent-vault|product-settings)|secret-manager|cert-manager|kms|secret-scanning|pam|agent-vault)(\/|$)/;

const leaves = (nodes: VirtualRouteNode[] = [], prefix = ""): string[] =>
  nodes.flatMap((node) => {
    if (node.type === "index") return [prefix || "/"];
    if (node.type === "layout") return leaves(node.children, prefix);
    if (node.type !== "route") return [];
    const path = `${prefix}${node.path}`;
    return node.children?.length ? leaves(node.children, path) : [path];
  });

const trim = (path: string) => path.replace(/\/$/, "");
const shape = (path: string) => trim(path).replace(/\$[A-Za-z_]+/g, "$");

const all = leaves(routes.children);
const v4 = all
  .filter((path) => path.startsWith("/v4/") && !path.endsWith("/$"))
  .map((path) => shape(path.slice("/v4".length)));
const pattern = (path: string) =>
  new RegExp(
    `^${shape(path)
      .split("/")
      .map((segment) =>
        segment === "$" ? "[^/]+" : segment.replace(/[.*+?^{}()|[\]\\$]/g, "\\$&")
      )
      .join("/")}$`
  );
const main = [...new Set(all.filter((path) => !path.startsWith("/v4/")).map(trim))]
  .filter((path) => productRoute.test(path))
  .sort();
const missing = main.filter((path) => !v4.some((twin) => pattern(path).test(twin)));

console.log(`${main.length - missing.length} of ${main.length} product routes have a v4 twin.`);
console.log(`${missing.length} without one:`);
missing.forEach((path) => console.log(`  ${path}`));
