# Documentation style guide

This guide defines how to write user-facing documentation for Infisical.

## Quick summary

1. **Provide context** — Explain what and why before how. Don't assume prior knowledge.
2. **Write for users** — No implementation details. Users care about outcomes, not internals.
3. **Cross-reference** — Link concepts that are essential for understanding.
4. **Use Mintlify components** — Steps, Tabs, Cards, Accordions, callouts, diagrams.
5. **Write clearly** — Active voice, specific verbs, concise sentences, sparing em dashes.
6. **Keep pages focused** — One purpose per page.
7. **Maintain flow** — New content should connect naturally with existing content.
8. **State prerequisites** — Tell readers what they need before they start.
9. **Be consistent** — Use the same terms throughout.
10. **Structure by purpose** — Guides, concepts, overviews, and references have different shapes.
11. **Use sentence case** — Write page titles, sidebar titles, and headings in sentence case.
12. **Run the linter** — `make lint-docs` checks the mechanical rules in this guide.

---

## 1. Provide context for new users

Don't assume the reader already knows what a feature is or why it matters. Every page should orient a new user before diving into details.

**Start with the "what" and "why":**

- What is this feature?
- Why would someone use it?
- When is it relevant?

Then move to the "how."

**Bad:** Jumping straight into configuration steps without explaining what the feature does.

**Good:** A brief opening paragraph that explains what this is and why it matters, then the steps.

If a reader lands on the page with no prior context, they should be able to understand what they're looking at within the first few sentences.

### Audience callouts

If a page is intended for a specific audience (admins vs. end users, product admins vs. application admins), say so at the top with an `<Info>` callout:

```mdx
<Info>
  This page is for product admins setting up PKI infrastructure. Teams issuing
  certificates should see
  [Applications](/documentation/platform/pki/applications/overview).
</Info>
```

This helps readers quickly know if they're in the right place.

### "When to use" sections

For pages that describe one approach among several (e.g., ACME vs. EST vs. SCEP), include a "When to use" section that helps readers decide if this is the right choice:

```mdx
## When to use ACME enrollment

<CardGroup cols={2}>
  <Card title="Web Servers" icon="server">
    Nginx, Apache, Tomcat with Certbot.
  </Card>
  <Card title="Kubernetes" icon="dharmachakra">
    Use cert-manager to issue certificates.
  </Card>
</CardGroup>
```

This makes it easier for readers to quickly assess whether to continue reading or look elsewhere.

---

## 2. Write for users, not implementers

Documentation should be readable and understandable by someone who has never seen our codebase.

**The test:** Would a user who has never seen our code understand this? If the answer is no, rewrite it.

Users care about what they can do and what happens — not how we built it. Don't expose implementation details like API endpoints, database schemas, internal service names, or "how it works under the hood" explanations.

**Exception:** Architecture docs (`*/architecture.mdx`) can explain system design.

---

## 3. Cross-reference core concepts

When you reference a concept that is core to understanding the page, link to its documentation. If a reader wouldn't understand the page without knowing what that concept means, link it.

Link on the first mention of a concept on the page — not every time it appears. After the first linked mention, readers know what it is and can scroll back if needed.

```mdx
<!-- Good: Gateway is core to understanding this page -->

Users connect through a [Gateway](/documentation/platform/gateways/overview)
without ever seeing credentials.

<!-- Good: "Learn more" for deeper context -->

Permissions are set at the folder level.
[Learn more about Folders →](/documentation/platform/pam/folders/overview)
```

---

## 4. Use Mintlify components

Take full advantage of Mintlify's component library rather than relying on plain markdown. Components make documentation more scannable, interactive, and easier to navigate.

### Procedures

Use `<Steps>` when readers need to complete a discrete, ordered procedure, especially a sequence of actions in the Infisical UI:

```mdx
<Steps>
  <Step title="Create a folder">
    Go to **Settings → Folders** and click **Create**.
  </Step>
  <Step title="Configure permissions">Assign roles to users or groups.</Step>
</Steps>
```

A longer guide should use headings such as `## Step 1: Configure in Infisical` to organize its major stages, with `<Steps>` nested within a stage where numbered actions improve clarity.

### Alternative approaches

Use `<Tabs>` when there are multiple ways to accomplish something:

```mdx
<Tabs>
  <Tab title="Web">Connect through your browser...</Tab>
  <Tab title="CLI">Use the command line...</Tab>
</Tabs>
```

### Callouts

Use callouts to highlight important information:

```mdx
<Note>Prerequisites or important context.</Note>
<Warning>Destructive actions or irreversible changes.</Warning>
<Tip>Helpful suggestions or best practices.</Tip>
<Info>Additional context that's good to know.</Info>
```

### Navigation

Use `<Card>` and `<CardGroup>` to guide readers to related pages:

```mdx
<CardGroup cols={2}>
  <Card title="Quick Start" icon="rocket" href="/docs/quick-start">
    Get started in 5 minutes.
  </Card>
  <Card title="Concepts" icon="book" href="/docs/concepts">
    Understand the fundamentals.
  </Card>
</CardGroup>
```

### Diagrams and visuals

Use diagrams when explaining technical concepts with multiple connecting pieces. Visuals help readers understand relationships, data flows, and architecture far better than text alone.

**Good candidates for diagrams:**

- How components connect to each other
- Request/response flows
- Authentication or authorization flows
- Architecture overviews
- Anything with multiple steps happening across different systems

Mintlify supports [Mermaid diagrams](https://mermaid.js.org/) inline, or you can include images.

### Frequently asked questions

Use `<AccordionGroup>` with `<Accordion>` for FAQ sections. FAQs are valuable — they address common questions, edge cases, and "but what about..." scenarios without cluttering the main content.

**Consider adding FAQs when:**

- A feature has common gotchas or misconceptions
- Users often ask the same questions
- There are edge cases that don't fit the main flow
- The "how it works" has nuances worth explaining

```mdx
<AccordionGroup>
  <Accordion title="Can I do X while Y is happening?">
    Yes, but only if Z. Here's why...
  </Accordion>
  <Accordion title="What happens if something goes wrong?">
    The system automatically handles this by...
  </Accordion>
</AccordionGroup>
```

FAQs make documentation easier to scan — readers can jump straight to their question instead of hunting through paragraphs.

### Code examples

Include code examples only when they genuinely help understanding — not to make documentation look technical or comprehensive. A well-placed example clarifies; too many examples overwhelm.

**When to include code:**

- The syntax isn't obvious from the description alone
- Readers need something copy-pasteable to get started
- Showing expected output helps verify success

**When to skip code:**

- The UI walkthrough is sufficient
- The concept is better explained in prose
- Adding code would just repeat what's already clear

**When you do include code:**

- Make it copy-pasteable — no `$` prompts that break pasting
- Use obvious placeholders: `<your-api-key>`, `<project-id>`, not `abc123` or `foo`
- Use realistic values where possible (actual domain names, plausible configs)
- Show expected output when it helps readers verify they did it right
- Keep examples minimal — show what's needed, not everything possible

```bash
# Good: obvious placeholder, minimal, copy-pasteable
curl -X POST https://app.infisical.com/api/v1/secrets \
  -H "Authorization: Bearer <your-access-token>" \
  -d '{"key": "DATABASE_URL", "value": "postgres://..."}'

# Bad: unnecessary headers, too verbose
curl -X POST https://app.infisical.com/api/v1/secrets \
  -H "X-Request-ID: 12345" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "X-Custom-Header: value" \
  ...
```

### Other components

Mintlify offers many more components — use whatever best serves the reader's understanding.

---

## 5. Write clearly and directly

Documentation should read like instructions from a knowledgeable colleague: direct, specific, and easy to follow.

- Prefer active voice over passive
- Use specific verbs over vague ones
- Keep sentences and paragraphs concise
- Explain jargon on first use

### Use sentence case for titles and headings

Always use sentence case for:

- The `title` and `sidebarTitle` frontmatter fields
- Markdown headings at every level

Capitalize the first word after a colon: `## Step 1: Configure in Infisical`.

Capitalize only the first word and proper nouns, product names, and acronyms such as Infisical, Docker, CLI, and ACME.

```mdx
<!-- Good -->
---
title: "Inject secrets into a Docker application"
sidebarTitle: "Docker quickstart"
---

## Next steps

<!-- Bad -->
---
title: "Inject Secrets Into a Docker Application"
sidebarTitle: "Docker Quickstart"
---

## Next Steps
```

### Don't overuse em dashes

Reach for a comma, colon, parentheses, or a full stop first. An occasional em dash is fine, but several in a paragraph, or one in most sentences, means the punctuation is doing the work that sentence structure should.

---

## 6. Keep pages focused

Each page should have a clear, single purpose. Keep related workflows together when readers benefit from seeing them in one place. For example, an integration guide can cover several delivery methods and related configuration such as Docker Compose as long as every section serves the same integration goal.

Use `<Tabs>` for alternative methods when readers choose one path. Use headings for related extensions that readers may complete after the primary workflow. Split a page when its sections serve genuinely different purposes, not merely because the page is long.

**Signs a page should be split:**

- Readers have to scroll past content that isn't relevant to them
- The table of contents has more than 5-6 top-level sections
- Different audiences have unrelated goals (e.g., admins configuring infrastructure vs. end users consuming it)

**Better structure:**

- One page for the concept overview
- Separate pages for each workflow or use case
- A dedicated page for reference material (configuration options, API fields)
- Troubleshooting as its own page if it's substantial

Short, focused pages are easier to navigate, easier to link to, and easier to maintain.

---

## 7. Maintain flow when editing

When adding or modifying content on an existing page, make sure it fits naturally with what comes before and after. Don't just insert content — connect it.

**Check that:**

- The page still reads coherently from top to bottom
- New sections follow logically from previous ones
- Transitions make sense (readers shouldn't feel jarred)
- The overall narrative or structure isn't broken

If new content doesn't fit the existing flow, consider whether it belongs on this page at all, or whether the page structure needs to be reorganized.

---

## 8. State prerequisites explicitly

If a page assumes something is already set up — a Gateway deployed, permissions granted, a CLI installed — state it at the top. Readers shouldn't get stuck halfway through because they missed an unstated requirement.

Use an `<Info>` callout for a short prerequisite list:

```mdx
<Info>
Prerequisites:

- An Infisical account
- A [Gateway](/documentation/platform/gateways/overview) that can reach your database
</Info>
```

Use a "Prerequisites" section before the main content when requirements need additional explanation. Reserve `<Note>` for prerequisite details that apply to a specific step rather than the whole page.

---

## 9. Use consistent terminology

Use the same terms throughout the documentation. Don't switch between synonyms for the same concept — it confuses readers and makes searching harder.

**Examples:**

- Pick "secret" or "credential" and stick with it in context
- Don't mix "folder" and "directory" interchangeably
- Don't call something a "project" in one place and a "workspace" in another

If Infisical has a specific term for something, use that term consistently.

---

## 10. Page structure

Structure depends on what the page is for. Don't force every page into the same template.

**All pages need:**

- Frontmatter with a `title` and a `description`
- An opening that orients the reader

`sidebarTitle` is optional. Add one when the page title is too long for the sidebar or reads
poorly out of context; otherwise the title is used.

**How-to / Guide pages:**

- Prerequisites (if any)
- Step-by-step procedures
- Next steps with `<CardGroup>`

**Concept pages:**

- Explanation of what it is and why it matters
- How components relate to each other
- Links to related concepts and guides

**Overview / Landing pages:**

- Brief intro
- Navigation cards to sub-pages

**Reference pages:**

- Structured information (tables, field descriptions)
- Examples where helpful

Use the structure that best serves the reader for that type of content.

---

## 12. What Vale enforces

Some of this guide is checked by [Vale](https://vale.sh). Run `make lint-docs` from the
repository root before opening a documentation pull request.

Vale cannot see prose indented inside components, which is a large share of this repo. A clean
run is not evidence that a nested page was checked. See `docs/CONTRIBUTING.MD` for the detail.

Vale covers the mechanical rules only: sentence case in headings and in the `title` and
`sidebarTitle` fields, the presence of a `description`, consistent product and vendor
spellings, spelling against a curated vocabulary, `$` prompts in code blocks, placeholder
names like `foo`, and more than two em dashes in one paragraph.

Everything else here -- providing context, writing for users, cross-referencing, choosing the
right component, page structure -- is a judgment call that only a reviewer can make. A clean
Vale run means nothing was mechanically wrong, not that the page is good.

See `docs/CONTRIBUTING.MD` for how to add a word to the vocabulary, enforce a new spelling,
or suppress a rule where Vale is wrong.
