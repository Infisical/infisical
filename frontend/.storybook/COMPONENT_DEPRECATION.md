# Component deprecation

Deprecate a shared component only when maintainers can name a supported replacement and give consumers an actionable migration path. A component folder or generation does not determine lifecycle status.

## Mark a component deprecated

1. Confirm replacement parity against representative production consumers. Record unresolved behavior in the lifecycle ledger instead of deprecating the component.
2. Add a `@deprecated` JSDoc annotation to the exported TypeScript API. Name the replacement and the conditions under which migration is safe.
3. Use `defineComponentDeprecation` in the component's Storybook meta. Keep the `deprecated` tag as a string literal so Storybook can index it statically:

   ```tsx
   import { defineComponentDeprecation } from "../../../../../.storybook/deprecation";

   const componentDeprecation = defineComponentDeprecation({
     reason: "Why new consumers should avoid this API.",
     replacement: "ReplacementComponent",
     migration: "The concrete steps and parity constraints for existing consumers."
   });

   const meta = {
     // ...
     tags: ["autodocs", "deprecated"],
     parameters: {
       deprecation: componentDeprecation
     }
   } satisfies Meta<typeof DeprecatedComponent>;
   ```

4. Rewrite the default story and component description as compatibility guidance. Do not recommend deprecated usage for new work.
5. Update `src/components/COMPONENT_LIFECYCLE.md` with the evidence, status, blocker, and follow-up ticket when one exists.
6. Build Storybook and run the frontend validation gate. Confirm the notice appears once above the component in Canvas and once near the top of generated Docs.

Migrate or remove consumers in separately scoped work. Deprecation itself does not authorize a mass migration or removal.
