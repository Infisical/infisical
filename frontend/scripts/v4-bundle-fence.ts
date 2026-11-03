import type { Plugin } from "vite";

const v4Module = /\/src\/(components|pages)\/v4\//;
const v4RouteDefinition = /\/src\/pages\/v4\/(?:.+\/)?route\.tsx$/;
const v4Owner = /\/src\/(components\/v4|pages\/v4|pages\/design-system)\//;

// main must not ship v4 before cutover: no v4 module may load with the entry or a v3 route.
export const v4BundleFence = (): Plugin => ({
  name: "v4-bundle-fence",
  apply: "build",
  generateBundle(_options, bundle) {
    const chunks = Object.values(bundle).filter((output) => output.type === "chunk");
    const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
    const roots = chunks.filter(
      (chunk) =>
        chunk.isEntry || (chunk.isDynamicEntry && !v4Owner.test(chunk.facadeModuleId ?? ""))
    );
    const violations = roots.flatMap((root) => {
      const seen = new Set<string>();
      const queue = [root.fileName];
      const found: string[] = [];
      while (queue.length) {
        const chunk = byFile.get(queue.shift()!);
        if (chunk && !seen.has(chunk.fileName)) {
          seen.add(chunk.fileName);
          found.push(
            ...Object.keys(chunk.modules).filter(
              (id) => v4Module.test(id) && !v4RouteDefinition.test(id)
            )
          );
          queue.push(...chunk.imports);
        }
      }
      return found.map((id) => `${root.facadeModuleId ?? root.fileName} loads ${id}`);
    });
    if (violations.length) {
      this.error(
        `v4 code reached main's bundle. Only v4 routes and the design system may load it:\n${[
          ...new Set(violations)
        ]
          .slice(0, 20)
          .join("\n")}`
      );
    }
  }
});
