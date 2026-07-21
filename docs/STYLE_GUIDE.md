# Documentation Style Guide

This guide defines how to write user-facing documentation for Infisical.

## Quick Summary

1. **Provide context** — Explain what and why before how. Don't assume prior knowledge.
2. **Write for users** — No implementation details. Users care about outcomes, not internals.
3. **Cross-reference** — Link concepts that are essential for understanding.
4. **Use Mintlify components** — Steps, Tabs, Cards, Accordions, callouts, diagrams.
5. **Write clearly** — Active voice, specific verbs, concise sentences.
6. **Keep pages focused** — One purpose per page. Split if it gets too long.
7. **Maintain flow** — New content should connect naturally with existing content.
8. **State prerequisites** — Tell readers what they need before they start.
9. **Be consistent** — Use the same terms throughout.
10. **Structure by purpose** — Guides, concepts, overviews, and references have different shapes.

---

## 1. Provide Context for New Users

Don't assume the reader already knows what a feature is or why it matters. Every page should orient a new user before diving into details.

**Start with the "what" and "why":**

- What is this feature?
- Why would someone use it?
- When is it relevant?

Then move to the "how."

**Bad:** Jumping straight into configuration steps without explaining what the feature does.

**Good:** A brief opening paragraph that explains what this is and why it matters, then the steps.

If a reader lands on the page with no prior context, they should be able to understand what they're looking at within the first few sentences.

### Audience Callouts

If a page is intended for a specific audience (admins vs. end users, product admins vs. application admins), say so at the top with an `<Info>` callout:

```mdx
<Info>
  This page is for product admins setting up PKI infrastructure. 
  Teams issuing certificates should see [Applications](/documentation/platform/pki/applications/overview).
</Info>
```

This helps readers quickly know if they're in the right place.

### "When to Use" Sections

For pages that describe one approach among several (e.g., ACME vs. EST vs. SCEP), include a "When to Use" section that helps readers decide if this is the right choice:

```mdx
## When to Use ACME Enrollment

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

## 2. Write for Users, Not Implementers

Documentation should be readable and understandable by someone who has never seen our codebase.

**The test:** Would a user who has never seen our code understand this? If the answer is no, rewrite it.

Users care about what they can do and what happens — not how we built it. Don't expose implementation details like API endpoints, database schemas, internal service names, or "how it works under the hood" explanations.

**Exception:** Architecture docs (`*/architecture.mdx`) can explain system design.

---

## 3. Cross-Reference Core Concepts

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

## 4. Use Mintlify Components

Take full advantage of Mintlify's component library rather than relying on plain markdown. Components make documentation more scannable, interactive, and easier to navigate.

### Procedures

Use `<Steps>` for any sequence of actions:

```mdx
<Steps>
  <Step title="Create a folder">
    Go to **Settings → Folders** and click **Create**.
  </Step>
  <Step title="Configure permissions">Assign roles to users or groups.</Step>
</Steps>
```

### Alternative Approaches

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

### Diagrams and Visuals

Use diagrams when explaining technical concepts with multiple connecting pieces. Visuals help readers understand relationships, data flows, and architecture far better than text alone.

**Good candidates for diagrams:**

- How components connect to each other
- Request/response flows
- Authentication or authorization flows
- Architecture overviews
- Anything with multiple steps happening across different systems

Mintlify supports [Mermaid diagrams](https://mermaid.js.org/) inline, or you can include images.

### Frequently Asked Questions

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

### Code Examples

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

### Other Components

Mintlify offers many more components — use whatever best serves the reader's understanding.

---

## 5. Write Clearly and Directly

Documentation should read like instructions from a knowledgeable colleague — direct, specific, and easy to follow.

- Prefer active voice over passive
- Use specific verbs over vague ones
- Keep sentences and paragraphs concise
- Explain jargon on first use

---

## 6. Keep Pages Focused

Each page should have a clear, single purpose. If a page is getting long or covering multiple distinct topics, split it into separate pages.

**Signs a page should be split:**

- It covers setup _and_ advanced configuration _and_ troubleshooting
- Readers have to scroll past content that isn't relevant to them
- The table of contents has more than 5-6 top-level sections
- Different audiences need different parts (e.g., admins vs. end users)

**Better structure:**

- One page for the concept overview
- Separate pages for each workflow or use case
- A dedicated page for reference material (configuration options, API fields)
- Troubleshooting as its own page if it's substantial

Short, focused pages are easier to navigate, easier to link to, and easier to maintain.

---

## 7. Maintain Flow When Editing

When adding or modifying content on an existing page, make sure it fits naturally with what comes before and after. Don't just insert content — connect it.

**Check that:**

- The page still reads coherently from top to bottom
- New sections follow logically from previous ones
- Transitions make sense (readers shouldn't feel jarred)
- The overall narrative or structure isn't broken

If new content doesn't fit the existing flow, consider whether it belongs on this page at all, or whether the page structure needs to be reorganized.

---

## 8. State Prerequisites Explicitly

If a page assumes something is already set up — a Gateway deployed, permissions granted, a CLI installed — state it at the top. Readers shouldn't get stuck halfway through because they missed an unstated requirement.

Use a `<Note>` callout for critical prerequisites:

```mdx
<Note>
  This guide requires a [Gateway](/documentation/platform/gateways/overview)
  that can reach your database.
</Note>
```

Or list them in a "Prerequisites" section before the main content.

---

## 9. Use Consistent Terminology

Use the same terms throughout the documentation. Don't switch between synonyms for the same concept — it confuses readers and makes searching harder.

**Examples:**

- Pick "secret" or "credential" and stick with it in context
- Don't mix "folder" and "directory" interchangeably
- Don't call something a "project" in one place and a "workspace" in another

If Infisical has a specific term for something, use that term consistently.

---

## 10. Page Structure

Structure depends on what the page is for. Don't force every page into the same template.

**All pages need:**

- Frontmatter with `title`, `sidebarTitle`, and `description`
- An opening that orients the reader

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
