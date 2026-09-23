# Documentation style guide

This guide defines how to write user-facing documentation for Infisical.

## Quick summary

1. **Provide context:** Explain what a feature is and why readers would use it before explaining how to use it.
2. **Write for users:** Describe what users can do and what happens, not how Infisical is built.
3. **Cross-reference:** Link every concept a reader needs to know to understand the page.
4. **Use Mintlify components:** Steps, Tabs, Cards, Accordions, callouts, and diagrams.
5. **Write clearly:** Write plain technical English. Say exactly what you mean, with active voice, specific verbs, and few em dashes.
6. **Keep pages focused:** Give each page one purpose.
7. **Maintain flow:** Connect new content to the content around it.
8. **State prerequisites:** Tell readers what they need before they start.
9. **Be consistent:** Use the same term for the same thing on every page.
10. **Structure by purpose:** Guides, concept pages, overviews, and reference pages each need a different structure.
11. **Use sentence case:** Write page titles, sidebar titles, and headings in sentence case.
12. **Rewrite the sentences:** Say each thing once, in your own words. Read every sentence out loud.
13. **Bold is for UI:** Use bold only for buttons, menus, and fields. Use "select", not "click" or "tap".
14. **Run the linter:** `make lint-docs-branch` checks the rules in this guide that a pattern can match.

---

## 1. Provide context for new users

Don't assume the reader already knows what a feature does or why they'd use it. Every page should explain what the feature is before it goes into details.

**Start with the "what" and "why":**

- What is this feature?
- Why would someone use it?
- When is it relevant?

Then explain the "how."

**Bad:** Starting with configuration steps without explaining what the feature does.

**Good:** A short opening paragraph that explains what the feature is and why it matters, followed by the steps.

A reader who opens the page without knowing anything about the feature should understand what the page covers after the first few sentences.

### Audience callouts

If a page is written for a specific audience (admins vs. end users, product admins vs. application admins), say so at the top of the page with an `<Info>` callout:

```mdx
<Info>
  This page is for product admins setting up PKI infrastructure. Teams issuing
  certificates should see
  [Applications](/documentation/platform/pki/applications/overview).
</Info>
```

An audience callout tells readers right away whether the page is meant for them.

---

## 2. Write for users, not implementers

A reader who has never seen the Infisical codebase should be able to understand every page.

**The test:** Would a user who has never seen the Infisical code understand this sentence? If the answer is no, rewrite the sentence.

Describe what users can do and what happens when they do it, not how Infisical is built. Leave out implementation details such as internal API endpoints, database schemas, internal service names, and explanations of how a feature works internally.

**Exception:** Architecture docs (`*/architecture.mdx`) can explain system design.

---

## 3. Cross-reference core concepts

If a reader needs to know what a concept means to understand the page, link the concept to its documentation.

Link a concept the first time the page mentions the concept, not every time. Readers who need the link again can scroll back to the first mention.

```mdx
<!-- Good: Gateway is core to understanding this page -->

Users connect through a [Gateway](/documentation/platform/gateways/overview)
without ever seeing credentials.

<!-- Good: "Learn more" for deeper context -->

Permissions are set at the folder level.
[Learn more about Folders →](/documentation/platform/pam/folders/overview)
```

### Link instead of pointing

Don't refer readers to content "above" or "below". Link to the section instead, whether the section is on the same page or another page, so readers don't have to scroll to find the section you mean.

**Instead of:** These limits differ from the Infisical Cloud limits above.

**Write:** These limits differ from the [Infisical Cloud limits](#limits-on-infisical-cloud).

### Say how, whenever you say someone can do something

If you tell the reader they can do something, link to the instructions for doing it. If no page has those instructions and the steps are short, write the steps on the page.

**Instead of:** An admin can change these limits.

**Write:** A super admin can change these limits in the [Server Console](/documentation/platform/admin-panel/server-admin).

### Refer to endpoints by what they do, and link them

In a sentence, describe what an endpoint does and link to the endpoint's reference page. Use the method and path only in code blocks. Link every endpoint you mention, even an endpoint you mention only in passing.

**Instead of:** Call `POST /api/v1/auth/universal-auth/login` with the client ID and client secret.

**Write:** Call [the login endpoint for Universal Auth](/api-reference/endpoints/universal-auth/login) with the client ID and client secret.

---

## 4. Use Mintlify components

Use a Mintlify component instead of plain Markdown wherever a component fits the content. Components make pages easier to scan and navigate.

### Procedures

Use `<Steps>` for a procedure the reader completes in order, such as a sequence of actions in the Infisical UI. Leave out the `title` prop, and start each step with the action the reader takes:

```mdx
<Steps>
  <Step>
    Go to **Settings** > **Folders** and select **Create**.
  </Step>
  <Step>
    Assign roles to users or groups.
  </Step>
</Steps>
```

If a guide has more than one stage, give each stage a heading in the form `## Step 1: Configure in Infisical`, and put the actions for that stage in a `<Steps>` block under the heading:

```mdx
## Step 1: Create a machine identity

<Steps>
  <Step>
    In your organization, go to **Access Control** > **Machine Identities**, then select **Create**.
  </Step>
  <Step>
    Enter a **Name**, pick a **Role**, and select **Create**.
  </Step>
</Steps>
```

Take button names, tab names, and the order of screens from the current product, not from an older docs page. Button names, tab names, and the order of screens change between releases, so a guide copied from another guide repeats any mistakes in the older guide.

### Alternative approaches

Use `<Tabs>` when the reader can complete a task in more than one way:

```mdx
<Tabs>
  <Tab title="Web">Connect through your browser...</Tab>
  <Tab title="CLI">Use the command line...</Tab>
</Tabs>
```

### Callouts

Use a callout for information the reader shouldn't miss:

```mdx
<Note>Important context that applies to a specific part of the page.</Note>
<Warning>Destructive actions or irreversible changes.</Warning>
<Tip>Helpful suggestions or best practices.</Tip>
<Info>Additional context that's good to know.</Info>
```

List page-level prerequisites under a `## Prerequisites` heading, not in a callout.

### Navigation

Use `<Card>` and `<CardGroup>` to link to related pages:

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

Use a diagram to explain how several components connect. A diagram shows relationships, data flows, and architecture more clearly than text alone.

**Good candidates for diagrams:**

- How components connect to each other
- Request/response flows
- Authentication or authorization flows
- Architecture overviews
- A process with steps that run on different systems

You can write a diagram inline with [Mermaid](https://mermaid.js.org/) or include the diagram as an image.

### Frequently asked questions

Use `<AccordionGroup>` with `<Accordion>` for FAQ sections. An FAQ answers common questions and covers edge cases without adding them to the main content of the page.

**Consider adding FAQs when:**

- Readers commonly misunderstand how a feature behaves
- Users often ask the same questions
- An edge case doesn't fit into the main steps
- A feature behaves in a way that needs more explanation than the main content gives

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

An FAQ lets readers go straight to their question instead of searching through paragraphs.

### Code examples

Include a code example only when the example helps the reader understand or complete the task, not to make the page look thorough. Too many examples make a page harder to follow.

**When to include code:**

- The syntax isn't obvious from the description alone
- Readers need something copy-pasteable to get started
- Showing the expected output helps readers confirm the command worked

**When to skip code:**

- The UI steps are enough on their own
- Prose explains the concept better than code
- The code would repeat what the text already says

**When you do include code:**

- Make the code copy-pasteable (no `$` prompts, which break pasting)
- Use obvious placeholders: `<your-api-key>`, `<project-id>`, not `abc123` or `foo`
- Use realistic values where possible (actual domain names, plausible configs)
- Show the expected output when the output helps readers confirm the command worked
- Keep examples short, showing only what the task needs
- Check that every endpoint in an example exists, accepts the credential the example sends (an endpoint that only accepts user sessions rejects a machine identity token), and has a reference page with content
- Pick endpoints that work for every reader of the page; a getting-started example shouldn't call an endpoint that only works for one product unless the page is about that product

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

Mintlify has more components than this section lists. Use any component that makes the content easier to understand.

---

## 5. Write clearly and directly

Write the way a colleague who knows the product would give you instructions: directly, specifically, and in an order you can follow.

- Prefer active voice over passive
- Use specific verbs over vague ones
- Keep sentences and paragraphs concise
- Explain jargon the first time you use it

### Don't give human verbs to things that aren't human

A path, a policy, or a property can't say, know, understand, or want anything. Name who or what performs the action, and describe the action.

**Instead of:** A grant on `/payments` says nothing about `/payments/keys`.

**Write:** If you have a role on `/payments`, that role doesn't automatically apply to `/payments/keys`.

### Say what a thing is, in one clause

Define a field or a concept in one plain clause. If you need a second clause to explain the first clause, rewrite the first clause so it says what the field or concept is.

**Instead of:** The `scope` property defines the boundary within which a grant is considered valid.

**Write:** `scope` is the folder path the grant applies to.

### Say it once

If a sentence repeats the previous sentence in different words, delete whichever of the two sentences adds less information.

**Instead of:** Access is granted per folder. Each folder carries its own access list. Because access is defined at the folder level, permissions on one folder do not carry over to another.

**Write:** Access is granted per folder, so permissions on one folder don't carry over to another.

### Keep pronouns next to what they refer to

If a reader has to look back to find out what "it" or "they" refers to, repeat the noun instead. A repeated word is easier to read than a sentence the reader has to parse twice.

**Instead of:** Add the service token to the project, then open the environment settings and confirm that it is active.

**Write:** Add the service token to the project, then open the environment settings and confirm the token is active.

**Instead of:** Whether they're passed as query parameters or in the request body depends on the endpoint.

**Write:** Depending on the endpoint, `offset` and `limit` are passed either as query parameters or in the request body.

### Give every transitive verb its object

Verbs like request, create, return, send, and apply need an object that says what is requested, created, returned, sent, or applied. Without the object, the reader has to guess, and a missing object often means the writer hadn't decided that detail yet.

**Instead of:** You create the service in your Infisical dashboard, and the agent requests.

**Write:** You create the service in your Infisical dashboard, and the agent requests credentials for it.

An object usually goes missing when someone edits a sentence and cuts off the end of the sentence. Read the second half of every long sentence on its own, and check that each verb in that half has an object.

### Lead with the behavior, not a label for it

Calling something an exception, a special case, or a caveat warns the reader that something is different without saying what is different. Describe the behavior instead.

**Instead of:** Folder access is the exception.

**Write:** Folder access doesn't inherit. A role on a parent folder gives no access to the folders inside it.

### Split mid-sentence detours

A clause in the middle of a sentence interrupts the sentence, and the reader has to go back to find where the main clause left off. Split the sentence into two sentences, or move the clause to the start of the sentence.

**Instead of:** The menu adds temporary access and once a grant exists removes folder access.

**Write:** The same menu lets you add temporary access or remove access.

### Name what actually happens

Instead of an abstract phrase, say which system does what, with which input, and what the result is. An abstract phrase can hide the fact that the writer didn't know how the feature works.

**Instead of:** Permissions are evaluated against the resource hierarchy.

**Write:** Infisical checks the exact folder path you asked for, and only that path.

### Say exactly what you mean

This is technical documentation. Write plain, literal English. A reader has to translate a metaphor or a figurative verb into what actually happens before they can act on the sentence. Always say exactly what you mean outright.

**Instead of:** Use the API to drive every resource and wire Infisical into your tooling.

**Write:** The API supports every action available in the Infisical dashboard.

**Instead of:** The rest sit between those two: they trade something the caller already has for an access token.

**Write:** OIDC, JWT, LDAP, TLS certificate, and SPIFFE Auth accept a credential from a trusted external system, such as an OIDC identity token or a client certificate.

### Name the exact subject

Name the specific thing you're describing, not a broader category that includes it. If you write "a resource" or "an instance", the reader has to work out which resource or instance you mean.

**Instead of:** A resource's version is only incremented for breaking changes.

**Write:** Each endpoint path is versioned independently.

### Say what a qualifier refers to

Words like "default", "built-in", "underlying", and "standard" only make sense with the thing they refer to: a default for what? built into what? If the sentence doesn't name that thing, the reader has to guess. Replacing one of these words with another doesn't fix the sentence. Name the thing, or describe the thing directly.

**Instead of:** If you self-host Infisical, the built-in defaults apply.

**Write:** If you self-host Infisical, no rate limits are enforced on the API by default.

### Use common words

Use a word every reader knows instead of a word only specialists use. If a technical term is the only accurate word, explain the term or link to a page that explains the term.

**Instead of:** Prepend the base URL to the path. Apply throttling at your ingress or reverse proxy.

**Write:** The full URL is the base URL followed by the path. You'll need to configure an external rate limiter.

### Don't invent terms

Use the name that the product, the protocol, or everyday English already has for something. Made-up phrases such as "worked example" or "response envelope" are confusing.

**Instead of:** This page shows one worked example.

**Write:** This page includes an example of {x}.

### Make sentences unambiguous

If a reader can parse a sentence two ways, it makes the sentence harder to understand and could force the reader to reread the sentence. There are two main causes for this problem:

1. A noun placed directly before the verb, so the noun and the verb read as one phrase. In "Any endpoint that returns a list of resources paginates", the words "resources paginates" read as one phrase. Don't shorten a sentence so much that its nouns and verbs end up next to each other like this. A clear sentence is better than a short one.

2. A first word that can be either a noun or a verb. A reader who sees "List endpoints" at the start of a sentence reads the words as an instruction to list endpoints until the sentence's real verb appears. A reader who doesn't know the term "list endpoint" has no way to tell sooner.

**Instead of:** List endpoints in the Infisical API return one page of results per request.

**Write:** Endpoints that return multiple items paginate their responses.

### Address the reader only to add information

Don't add asides to the reader that make a sentence friendlier without adding information.

**Instead of:** The response includes `totalCount`, so you know when to stop.

**Write:** The response includes `totalCount`, which you can use to tell when you've read every page.

Do address the reader when the reader's situation decides whether a sentence applies to them. A condition written about the reader ("If you self-host Infisical") tells readers directly whether the sentence applies to them. The same condition written about an abstract noun ("On a self-hosted instance") leaves readers to work out whether the condition includes them.

**Instead of:** On a self-hosted or dedicated instance, replace the host.

**Write:** If you self-host Infisical, replace the host with the address of your instance.

### Use contractions

Write "it's", "don't", "you'll", and "can't". Full forms sound stiff and make sentences longer without adding anything.

**Instead of:** It is not possible to recover a deleted secret. You will need to create it again.

**Write:** You can't recover a deleted secret, so you'll need to create it again.

Vale reports the common full forms as suggestions.

### Read it out loud

Read every sentence out loud before you submit the page. If you wouldn't say a sentence that way to a colleague standing next to you, rewrite the sentence. Most sentences that break a rule in this section also fail this test.

**Instead of:** Access removal is reflected within the propagation window.

**Write:** Access is removed within 60 seconds.

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

Use a comma, a colon, parentheses, or a period before you use an em dash. An occasional em dash is fine. If a paragraph has several em dashes, or most of its sentences have one, restructure the sentences instead of adding more punctuation.

---

## 6. Keep pages focused

Give each page one purpose. Keep related workflows on the same page when readers need to see the workflows together. For example, an integration guide can cover several delivery methods and related configuration, such as Docker Compose, as long as every section helps the reader set up that integration.

Use `<Tabs>` for alternative methods when readers pick only one of the methods. Use headings for related tasks that readers might complete after the main workflow. Split a page when its sections have different purposes, not just because the page is long.

**Signs a page should be split:**

- Readers have to scroll past content that isn't relevant to them
- The table of contents has more than 5-6 top-level sections
- Different audiences have unrelated goals (for example, admins configuring infrastructure vs. end users consuming it)

**Better structure:**

- One page for the concept overview
- Separate pages for each workflow or use case
- A dedicated page for reference material (configuration options, API fields)
- A separate troubleshooting page if the troubleshooting content is long

Short, focused pages are easier to navigate, easier to link to, and easier to maintain.

---

## 7. Maintain flow when editing

When you add or change content on an existing page, make sure the new content follows from the section before it and leads into the section after it. Don't insert content without connecting the content to the text around it.

**Check that:**

- The page still reads in order from top to bottom
- Each new section follows from the section before it
- Readers can follow the move from each section to the next
- The order of sections on the page still makes sense

If new content doesn't fit the page's existing order, decide whether the content belongs on this page, or whether the page needs to be reorganized.

### Order sections the way a reader looks for them

Put each section where a reader will look for it. Keep sections that cover the same topic from different angles next to each other, and put content that applies to all of those sections after the whole group, not between two of the sections. Put each callout in the section the callout applies to.

**Instead of:** Cloud limits, then what happens when a request is rate limited, then self-hosted limits, with a note about Cloud plans at the bottom of the self-hosted section.

**Write:** Cloud limits with the note about Cloud plans, then self-hosted limits, then what happens when a request is rate limited.

---

## 8. State prerequisites explicitly

If a page assumes something is already set up, such as a deployed Gateway, granted permissions, or an installed CLI, list that requirement at the top of the page. Otherwise, readers can get stuck halfway through the steps because of a requirement the page didn't mention.

Use a `## Prerequisites` section before the main content, even when the list is short:

```mdx
## Prerequisites

- An Infisical account
- A [Gateway](/documentation/platform/gateways/overview) that can reach your database
```

Don't put page-level prerequisites in `<Info>` or other callouts. Use `<Note>` only for a requirement that applies to one step, not to the whole page.

**Make each prerequisite something the reader can check before they start.** A reader at the top of the page hasn't read the steps yet, so the reader can't check a prerequisite that depends on the steps.

**Instead of:** A role with the permissions required by the endpoints called in this guide

**Write:** A role that grants read access to secrets, such as **Viewer**

**Ask for the least access that works, and cover the kinds of access readers actually have.** Many readers aren't organization admins. If the task also works with project-level access, say so and give the project-level steps too.

**Instead of:** An Infisical organization where you have the **Admin** role

**Write:** The [Admin role](/documentation/platform/access-controls/role-based-access-controls) on either your Infisical organization or a project in the organization

**Link each prerequisite** to a page where the reader can get the prerequisite or learn what the prerequisite is.

**Include setup that a beginner won't have done yet.** If a quickstart needs a resource that most first-time readers don't have yet, such as a machine identity, create the resource in the steps instead of listing it as a prerequisite.

---

## 9. Use consistent terminology

Use the same term for a concept on every page. Switching between synonyms for the same concept confuses readers and makes search results less useful.

**Examples:**

- Pick "secret" or "credential" and use the same word throughout a page
- Don't mix "folder" and "directory" interchangeably
- Don't call something a "project" in one place and a "workspace" in another

If Infisical has a specific term for something, use that term consistently.

---

## 10. Page structure

Choose a page's structure based on what the page is for. Pages with different purposes need different sections.

**All pages need:**

- Frontmatter with a `title` and a `description`
- An opening that tells the reader what the page covers

`sidebarTitle` is optional. Add a `sidebarTitle` when the page title is too long for the sidebar or
doesn't make sense on its own in the sidebar. Without a `sidebarTitle`, the sidebar shows the page title.

**Headings name the topic in words a newcomer recognizes.** Readers often scan the headings before anything else on a page. A heading built around a code or a term the reader doesn't know yet won't help the reader find the section they need.

**Instead of:** `## 429 response`

**Write:** `## Exceeding rate limits (429 response)`

**Name groups for what they contain.** When items fall into categories, give each category a name that describes its items. "Other" tells the reader nothing, so find what the remaining items have in common and name the group after that.

**Instead of:** Universal Auth, Cloud providers, Other methods

**Write:** Infisical-issued credentials, Cloud providers, External identity

**How-to / Guide pages:**

- Prerequisites (if any)
- Step-by-step procedures
- Next steps with `<CardGroup>`

**Concept pages:**

- An explanation of what the concept is and why it matters
- How the components relate to each other
- Links to related concepts and guides

**Overview / Landing pages:**

- A short introduction
- Navigation cards that link to the section's pages

A landing page at the top of a docs section also needs to show readers what the section
contains, so readers don't have to read the sidebar to find out. Organize the landing page the
same way the section's sidebar is organized.

- Start with one or two sentences about what readers will find in the section, not a
  definition of the product
- Cover every group in the section's sidebar, in one of two ways depending on the group:
  - **One card for the group** when the group's pages are steps or reference material for a
    single topic; the card links to the group's first page, and the card description says what
    the group covers (for example, Networking has one card for Gateways and one for Relays)
  - **A card per page** when the pages are alternatives the reader chooses between and the
    reader needs to see every option (for example, Self-hosting has a card for each deployment
    platform so readers can find the platform they already use)
- If the section has enough groups that one `<CardGroup>` would be too long, give each group a
  `##` heading with the same name the sidebar uses; a short section can put all its cards in
  one `<CardGroup>` with no headings
- Use each page's sidebar label as the title of the card that links to the page
- Put longer explanations after the cards, so readers looking for a link don't have to scroll
  past the explanations to find it
- Put detail that only some readers want, such as the reasons behind a choice, in an
  `<Accordion>` so the detail doesn't push the cards down the page

For examples of landing pages, see `self-hosting/overview`,
`documentation/platform/gateways/overview`, and `documentation/platform/identities/overview`.

**Reference pages:**

- Structured information (tables, field descriptions)
- Examples where helpful

Use whichever structure makes the page's type of content easiest to read.

---

## 11. Formatting and UI conventions

### Bold is for UI, never emphasis

Use bold only for something the reader has to find on screen: a button, a menu item, a tab, or a field name. If a sentence seems to need bold to make its point, rewrite the sentence.

You can bold a label at the start of a list item or a paragraph, such as `**Prerequisites:**`, because a label isn't emphasis. Don't start a sentence with a bold `**Note**:` prefix. Use a `<Note>` callout instead.

**Instead of:** This is **important**: rotation only applies to **active** secrets.

**Write:** Rotation only applies to active secrets. Select **Save** to apply the change.

### Format UI labels as bold, not quotes or code

Put button, tab, and field names in bold. Use quotes and code spans only for code, paths, keystrokes, and literal values.

**Instead of:** Click 'Submit', then navigate to `Personal Settings`.

**Write:** Select **Submit**, then go to **Personal settings**.

### Select, not click or tap

Use "select" for any interaction with a control. "Select" applies to a mouse, a touchscreen, and a keyboard, so the word doesn't assume which device the reader uses. For gestures that "select" can't describe, use `right-click` and `double-click`.

**Instead of:** Click the three dot menu, then tap **Add temporary access**.

**Write:** Select the three dot menu, then select **Add temporary access**.

### No periods at the end of bullet points

End every bullet point without a period. Keep each bullet to one sentence or phrase. If a bullet needs two sentences, combine the two sentences with a parenthesis, or turn the list into a paragraph.

**Instead of:**

- `offset`: the number of items to skip. Defaults to `0`.

**Write:**

- `offset`: the number of items to skip (defaults to `0`)

---

## 12. What Vale enforces

[Vale](https://vale.sh) checks some of the rules in this guide. Run `make lint-docs-branch` from
the repository root before you open a documentation pull request, or run `make lint-docs` to
check every page. The `Check docs style` CI check runs the same rules on the files a pull request
changes.

Vale doesn't check text indented inside components, and much of the text in this repository is
indented that way. If Vale reports no problems on a page with nested components, Vale may not
have checked the nested text. `docs/CONTRIBUTING.MD` describes this limit in more detail.

Vale checks only the rules that a pattern can match: sentence case in headings and in the
`title` and `sidebarTitle` fields, consistent product and vendor spellings, spelling against a
list of approved words, `$` prompts in code blocks, placeholder names like `foo`, more than two
em dashes in one paragraph, "click" and "tap" where the verb should be "select", and the full
forms of common contractions. Vale doesn't check the `description` frontmatter field, so check
the description yourself when you review a page.

Two of those rules don't fail the run yet. `Infisical.UIActions` reports at warning level and
`Infisical.Contractions` reports at suggestion level, because existing pages have several
hundred violations of each rule, and making either rule an error would fail every pull request
that edits those pages. Both rules will become errors once the existing violations are fixed,
so fix any violations on the pages you edit. Read the output Vale prints, not just the exit
code.

No automated check covers the two bold rules in section 11. Only a reviewer who knows the
product can tell whether a word is the name of a button that should be bold.

The rest of this guide needs a reviewer's judgment: providing context, writing for users,
cross-referencing, choosing the right component, page structure, and every sentence-level rule
in section 5. If Vale reports no problems, the page has no mistakes that a pattern can find, but
the page can still break every other rule in this guide.

To check the rules that Vale can't, run the `docs-style` skill.

For how to run the skill, add a word to the list of approved words, enforce a new spelling, or
turn off a rule on a line where Vale is wrong, see `docs/CONTRIBUTING.MD`.
