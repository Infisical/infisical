# Component deprecation

Deprecate a shared component only when maintainers can name a supported replacement and give consumers an actionable migration path. A component folder or generation does not determine lifecycle status.

## Mark a component deprecated

1. Confirm replacement parity against representative production consumers. Record unresolved behavior in the lifecycle ledger instead of deprecating the component.
2. Add a `@deprecated` JSDoc annotation to the exported TypeScript API. Name the replacement and the conditions under which migration is safe.
3. Add the `deprecated` tag to the component's Storybook meta. Keep it as a string literal so Storybook can index it statically and display the badge:

   ```tsx
   const meta = {
     // ...
     tags: ["autodocs", "deprecated"]
   } satisfies Meta<typeof DeprecatedComponent>;
   ```

4. Keep the existing component and story descriptions focused on behavior. Put replacement and migration guidance in the TypeScript annotation and lifecycle ledger.
5. Update `src/components/COMPONENT_LIFECYCLE.md` with the evidence, status, blocker, and follow-up ticket when one exists.
6. Build Storybook and run the frontend validation gate. Confirm the deprecated badge appears on the component in the sidebar and toolbar.

Migrate or remove consumers in separately scoped work. Deprecation itself does not authorize a mass migration or removal.
