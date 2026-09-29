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

## Where the example pages differ from the templates

The example pages each template names predate some of the style guide's rules. When you read
an example page, don't copy these:

- Titled steps (`<Step title="..." titleSize="h3">`); the guide says to leave out `title`
- Periods at the end of bullets
- Em dashes, such as "This guide doesn't configure any behavior—it just authenticates"
- Button labels in the 1Password and Databricks sync and rotation pages, which come from older
  versions of the wizards (**Next** instead of **Continue**, **Disable Secret Deletion**
  instead of **Prevent secret deletion**)
