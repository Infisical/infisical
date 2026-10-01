# Docs page templates

Each template gives the section order, components, and fixed wording for one type of page.

| Template | Use for | Lives at |
| --- | --- | --- |
| [app-connection.mdx](app-connection.mdx) | An app connection guide | `docs/integrations/app-connections/{product}.mdx` |
| [secret-sync.mdx](secret-sync.mdx) | A secret sync guide | `docs/integrations/secret-syncs/{product}.mdx` |
| [secret-rotation.mdx](secret-rotation.mdx) | A secret rotation guide | `docs/documentation/platform/secret-rotation/{rotation}.mdx` |
| [quickstart.mdx](quickstart.mdx) | A quickstart or task guide that ends in a working result | Varies |
| [landing-page.mdx](landing-page.mdx) | The overview page at the top of a docs section | `{section}/overview.mdx` |
| [concept-page.mdx](concept-page.mdx) | A page about one concept and the tasks that involve it | Varies |

## How to read a template

Every template uses the same four kinds of markup:

| Markup | Meaning | What to do |
| --- | --- | --- |
| Plain text | Fixed wording | Keep the wording if the wording is true for this product. Check every claim in it against the product first |
| `{Description}` | A placeholder | Replace the whole placeholder with your own text. The placeholder describes what goes there; it never contains text to copy |
| `{/* IF: condition */}` ... `{/* END IF */}` | A conditional block | Keep the block, without the two markers, only if the condition is true. Otherwise delete the block |
| `{/* NOTE: ... */}` | Guidance for the writer | Follow the guidance, then delete the comment |

Braces inside a code span, such as `` `{{secretKey}}` ``, are literal text the product uses, not
placeholders.

Before you publish, delete every `{/* ... */}` comment and search the page for `{` to find any
placeholder you missed.

## How closely to follow a template

A template is the default structure for a page type, not a form to fill in:

- **Leave out what the product doesn't have.** If a sync has no destination fields, or a
  quickstart has no second sub-task, delete that part rather than writing filler for it
- **Add what the product needs.** If the product needs a step or a section the template doesn't
  have, add it where a reader would look for it (STYLE_GUIDE.md section 7)
- **Check the fixed wording.** Fixed wording is true for most products of the type, not all of
  them. Button labels, field names, and behavior claims such as "The name must be
  slug-friendly" come from one version of the product, so check each one against the frontend
  or backend before keeping it
- **Write your own sentences.** The templates contain no example sentences on purpose. For what
  a finished page looks like, read the example pages named at the top of each template, but
  don't copy their sentences, which are about a different product

## Shared snippets for an integration

An app connection page, a sync page, and a rotation page for the same product render the same
setup steps and form fields, so those live in snippets under
`docs/snippets/app-connections/{product}/`:

- `form-fields.mdx`: a bullet list of the connection form's fields, starting with **Name** and
  **Description** (optional)
- `{setup}.mdx`, named after the setup task in the third-party product: a `<Steps>` block for
  that setup, with screenshots
- `{setup}-for-rotation.mdx`: only when a rotation needs more setup than the connection does;
  import the base snippet and add the extra steps rather than copying the base steps

A link in `form-fields.mdx` to a step in the setup snippet resolves on whichever page renders
both snippets. Link to the `## Step 1:` heading that every page puts the setup snippet under,
and give that heading the same text on the connection, sync, and rotation pages. Linking to a
step title doesn't work, because steps don't have a `title` prop.

Links from a sync or rotation page to the organization-level connection steps use
`/integrations/app-connections/{product}#step-2-create-the-app-connection`.

## Steps that depend on the integration

When a connection needs different setup for each integration that uses it, such as a separate
permission policy per integration, put a use case picker at the top of the page instead of a tab
per integration. `snippets/UseCasePicker.jsx` exports two components:

- `<UseCasePicker product="{Product}" groups={...} />`: an "I want to set up ___ with {Product}"
  dropdown where the reader picks one or more integrations
- `<UseCase use="{id}">`: shows its children only when the reader picked that id, or when they
  picked nothing, so the page reads as the complete guide by default. `use` takes a
  comma-separated list for content that several integrations share. Add `hideWhenEmpty` for
  content that only makes sense next to a filtered result, such as setup notes that follow a
  combined policy, so it stays hidden until the reader picks something

A `<UseCase>` can hold its own `###` heading. Mintlify builds the "On this page" list at build
time, so it would still list hidden headings; the picker hides those entries at runtime, so the
list matches what's on the page

Put the options in `snippets/app-connections/{product}/use-cases.jsx` as an exported array of
`{ label, options: [{ id, label }] }` groups, import it on the page next to the component, and
pass it as `groups`. A snippet can't import another snippet, so the page does both imports. The
picker writes the selection to the URL (`?use=id-1,id-2`), so a reader can share a link to a
filtered page.

Wrap each integration's content in its own `<UseCase>`, including its card in the
"Configure integrations" step. `integrations/app-connections/aws.mdx` is the example.

## Where the example pages differ from the templates

The example pages each template names predate some of the style guide's rules. When you read
an example page, don't copy these:

- Titled steps (`<Step title="..." titleSize="h3">`); the guide says to leave out `title`
- Periods at the end of bullets
- Em dashes, such as "This guide doesn't configure any behavior—it just authenticates"
- Button labels in the 1Password and Databricks sync and rotation pages, which come from older
  versions of the wizards (**Next** instead of **Continue**, **Disable Secret Deletion**
  instead of **Prevent secret deletion**)
