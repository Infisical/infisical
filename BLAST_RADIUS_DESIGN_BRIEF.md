# Blast Radius: Design Brief

This brief is self-contained. It can be handed to a designer with no prior Infisical context.
Implementation detail lives in [`BLAST_RADIUS_PLAN.md`](./BLAST_RADIUS_PLAN.md).

---

## Status: screens approved

Nine screens delivered and accepted (the seven briefed, plus the no-audit-permission and hard-truncation states). Values settled during design, now binding on the implementation:

| Decision | Value |
| --- | --- |
| Exposure bands | Low 0 to 29, Elevated 30 to 59, High 60 to 84, Critical 85 to 100, plus `Unavailable` |
| Read precision | Two states, `this secret` and `folder-level`, shown as a node badge, a focus-panel line, and a table column |
| Approximate counts | Folder-precision read counts render with a leading `~`; exact counts have no prefix |
| Client badges | Two visible plus an overflow count, ordered by frequency, with `web` tinted because a person reading a production credential in a browser is worth noticing |
| Outside-window reads | "No reads in 30d" and "last read 46d ago, outside the window" are different states and both appear |
| Truncation | A rendering limit is not a cluster. Not-drawn principals stay counted in every total |
| Simulation | Four sections: Why It Is Overdue Anyway, Will Break, Worth Knowing, Will Update Automatically |

Two copy lines are still inference the platform cannot prove and should be hedged when built, not designed again: "read at startup only / at boot" (derive it from read cadence and say "likely"), and "reloader restarts the pod" (assumes a third-party operator is installed).

---

## 1. Product context

Infisical is a secret management platform. Teams store credentials (database passwords, API keys) in it, and the platform distributes them to applications, cloud providers, and CI systems. Access is governed by roles, groups, and attribute-based conditions, which means that over time nobody can confidently answer a simple question: *who can actually read this credential, and what happens if I change it?*

**Blast Radius** is one screen that answers it. It is anchored on a single secret and shows three things around it:

- **Left**: every person, machine identity, and group entitled to read it, and why
- **Center**: the secret itself
- **Right**: everywhere the value has been pushed, imported, referenced, or copied

Plus a rotation simulation: press a button, get told what will break.

### The two most important ideas

> **1. Solid edges mean observed. Dashed edges mean entitled but not seen in the window.**

This convention does the heavy lifting. A screen full of dashed lines is a picture of over-provisioning that needs no explanation, and it is the emotional beat of the whole feature. If a viewer takes away nothing else from the design, they should take away this.

> **2. Ghost readers sit apart: people who read this value and cannot read it today.**

Someone removed from a group, whose temporary access expired, who left the project, or who left the company entirely. They are not in the entitled list, but they read the value, so they know it. This group is small in number and large in consequence, and it needs a visual treatment that is clearly *outside* the entitled band without being buried. "Two people who read this value cannot read it today" is the strongest single sentence the screen can say.

**Copy rule that follows from this**: never write "never used" anywhere. Activity history has a retention limit that varies by customer plan, so the honest phrasing is always **"No reads in 30d"** with the window stated in the legend. Getting this wrong puts a false claim next to real data and costs trust in the entire screen.

---

## 2. Who uses it, and when

**Sofia, platform engineer.** About to rotate a production database password. She has been putting it off for months because she does not know what depends on it. She opens Blast Radius, hits Simulate Rotation, reads the four things that will break, fixes two of them, and rotates. Session length: two minutes. She wants a verdict, not a dashboard.

**Marcus, security engineer.** Running a quarterly access review, or responding to an incident at 2am. He wants to find over-provisioning, understand *why* each person has access (which group, which role, which condition), and revoke it inline. He wants density, filters, and evidence he can export. Session length: twenty minutes.

Both open it from a secret. Marcus also arrives from a ranked list of the most exposed secrets in the project.

---

## 3. Design system constraints

These are house rules, not preferences. The product already ships with them.

- **Dark-native.** There is no light theme. Page canvas is the darkest surface; depth is built with borders and surface tones, **never shadows**.
- **Dense, calm, legible.** The interface should read like infrastructure tooling, not a consumer analytics product. No decorative gradients, glows, or illustration.
- **Color carries meaning before brand.** Red means destructive or broken, not "accent". Semantic roles: success, warning, danger, info, neutral. Anything colored is a tinted background with a matching border, never a solid fill.
- **Motion is restrained.** 200ms ease-in-out, no springs, no decorative animation. One exception is called out in Screen 6.
- **Typography.** Inter for all product UI. Functional monospace for identifiers, paths, timestamps, and rule expressions (this matters here: secret paths and glob patterns must be mono so their characters align and read precisely). No display face anywhere in this feature.
- **Casing.** Title Case for page titles, card titles, sheet titles, button labels, badges. Sentence case for descriptions, helper text, and empty states.
- **Secret values are never shown.** Not in a node, not in a tooltip, not on hover. This screen shows relationships only. Do not design a "reveal value" affordance.

---

## 4. Screens needed

Desktop first, 1440 x 900. Seven screens plus one component sheet.

---

### S1. Blast Radius, default state

The hero screen. Three-band graph, secret in the center.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  Blast Radius                                                                  │
│  DB_PASSWORD   /prod/db   [prod]                                               │
│                                                                                │
│  ┌──────────────────────────┐  ┌─────────────────────────────────────────────┐ │
│  │  Exposure  74  High      │  │ 14 entitled · 6 observed · 2 ghost · 4 dests │ │
│  │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔         │  │                                              │ │
│  │  · 8 principals via one  │  │        [ Simulate Rotation ]  [ Graph|Table ]│ │
│  │    glob condition        │  │                                              │ │
│  │  · 1 sync failing        │  └─────────────────────────────────────────────┘ │
│  │  · reaches staging       │                                                  │
│  └──────────────────────────┘                                                  │
├────────────────────────────────────────────────────────────────────────────────┤
│ [Actions ▾] [Principals ▾] [☐ Hide never-used] [☐ Only via groups] [☐ Cross-proj]│
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   WHO CAN REACH IT              THE SECRET               WHERE IT GOES         │
│                                                                                │
│   ┌────────────────┐                                  ┌──────────────────────┐ │
│   │ 👤 alice       │════════╗                   ╔═════│ AWS Secrets Manager  │ │
│   │ Read Value     │        ║                   ║     │ ● Synced 4m ago      │ │
│   │ 1,204 reads    │        ║                   ║     └──────────────────────┘ │
│   └────────────────┘        ║  ┌──────────────┐ ║                              │
│                            ╠═>│              │═╣     ┌──────────────────────┐ │
│   ┌────────────────┐        ║  │ DB_PASSWORD  │ ║     │ GitHub · api-server  │ │
│   │ 👥 SRE      8  │────────╣  │              │ ╠═════│ ● Failed 3d ago      │ │
│   │ via glob       │        ║  │ /prod/db     │ ║     └──────────────────────┘ │
│   │ ▸ expand       │        ║  │ prod         │ ║                              │
│   └────────────────┘        ║  └──────────────┘ ║     ┌──────────────────────┐ │
│                            ║       ▲       ▲    ╚═════│ Imported by          │ │
│   ┌────────────────┐        ║       │       │          │ /staging/api  ⚠      │ │
│   │ 🤖 payments-api│════════╝       │       │          └──────────────────────┘ │
│   │ k8s · prod ns  │         Rotation-managed  Approval                        │
│   │ 40k reads      │                                                            │
│   └────────────────┘                                                            │
│                                                                                │
│   ┌────────────────┐                                                            │
│   │ 🤖 legacy-cd   │─ ─ ─ ─ ─ ─ ─ ─ ─ ┐                                        │
│   │ No reads 30d   │                                                            │
│   └────────────────┘                                                            │
│                                                                                │
│   ╌╌ Ghost readers ╌╌╌╌╌╌╌╌╌╌╌╌╌                                               │
│   ┌────────────────┐  ┌────────────────┐                                        │
│   │ 👤 dana        │  │ 🤖 old-runner  │   Read this value · cannot today       │
│   │ Access revoked │  │ Deleted        │                                        │
│   └────────────────┘  └────────────────┘                                        │
│                                                                                │
│   ═══ Observed 30d   ─ ─ Entitled, no reads 30d   ╌╌ Ghost      [+ − ⛶]        │
└────────────────────────────────────────────────────────────────────────────────┘
```

Notes for the designer:

- The **exposure score card** is the anchor of the header. The number needs weight, the band label needs semantic color, and the three drivers underneath are what make it actionable. A number without drivers is decoration.
- The **legend is permanent**, bottom-left of the canvas, and states the window. The solid-versus-dashed distinction is the whole feature; it does not get hidden behind a tooltip.
- **Ghost readers** are drawn below the entitled band, separated by a rule, with no edge to the secret (they have no current path to it, and drawing one would be a lie). Each carries a state badge: "Access revoked" if the person is still in the org, "Deleted" if they are gone entirely. This band is absent for most secrets, so design both the present and absent compositions.
- **A person can appear once with two clients.** The same user may read through the browser and through the CLI, and during an incident that distinction matters. Node design needs room for small client badges (`web`, `cli`, `k8s`, `terraform`, `sdk`) without becoming a sticker collection. Two visible plus an overflow count is probably the ceiling.
- **The consumption data may be absent entirely.** Viewers without audit-log permission get the graph with no observed data at all, because per-person activity is separately permissioned. Design that state: every edge dashed, no read counts, and an explanatory line rather than a broken-looking legend.
- Bands are visually implied by column alignment and the band captions, not by drawn containers. Boxes around bands would fight the graph.
- Graph canvas gets a subtle dot grid so panning is legible.
- Zoom and fit controls bottom-right.

---

### S2. Focus mode with the Explain panel

The screen after a click. This is where the product proves it knows something.

```
┌──────────────────────────────────────────────┬─────────────────────────────────┐
│                                              │  Access Path                  ✕ │
│   (everything not on the selected path        │                                 │
│    dims to ~20% opacity)                      │  👤 alice@acme.com              │
│                                              │  Can Read Value                 │
│   ┌────────────────┐                          │                                 │
│   │ 👤 alice       │═══════╗                  │  ├─ Member of group             │
│   │ Read Value     │       ║                  │  │  👥 SRE                      │
│   └────────────────┘       ║   ┌───────────┐  │  │                              │
│                            ╠══>│DB_PASSWORD│  │  ├─ Group holds role            │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ┐        ║   └───────────┘  │  │  🛡 prod-reader               │
│   ╎ 👥 SRE      8 ╎────────╝                  │  │                              │
│   └ ─ ─ ─ ─ ─ ─ ─ ┘  (dimmed)                 │  └─ Matched rule                │
│                                              │     secretPath  $GLOB  /prod/** │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ┐                           │     environment $IN    [prod]   │
│   ╎ 🤖 legacy-cd  ╎  (dimmed)                 │                                 │
│   └ ─ ─ ─ ─ ─ ─ ─ ┘                           │  ── Observed ──                 │
│                                              │  1,204 reads · last 6m ago      │
│                                              │  Precision: this secret          │
│                                              │                                 │
│                                              │  [Restrict Rule] [Remove From    │
│                                              │   Group] [View Audit Log]        │
└──────────────────────────────────────────────┴─────────────────────────────────┘
```

Notes:

- The **grant chain is the centerpiece**. Design it as a vertical chain with connector glyphs, each step carrying the icon of its kind (person, group, role, rule). The final step, the matched rule, is monospace and should feel like evidence: field, operator, value.
- Dimming, not hiding. Users need to keep their spatial orientation in the graph.
- The action buttons are the point. Panel design should not bury them below a scroll.
- Panel width around 380 to 420px. It overlays the canvas rather than resizing the graph, so the layout does not reflow on every click.
- A principal can have **more than one grant path** (direct role and group role). Design the multi-path case: stacked chains with a divider, and a count in the panel header.

---

### S3. Rotation Simulation modal

Sofia's entire session is this modal.

```
┌────────────────────────────────────────────────────────────┐
│  Simulate Rotation                                       ✕ │
│  DB_PASSWORD · /prod/db · prod                             │
├────────────────────────────────────────────────────────────┤
│                                                            │
│   ⛔  Not safe to rotate                                    │
│       4 things will break                                  │
│                                                            │
│   ┌──────────────────────────────────────────────────────┐ │
│   │ ⛔  GitHub · api-server                               │ │
│   │     Sync has been failing for 3 days. The new value  │ │
│   │     will not reach this destination.                 │ │
│   ├──────────────────────────────────────────────────────┤ │
│   │ ⛔  Zabbix · monitoring                               │ │
│   │     Auto-sync is off. Someone has to push this by    │ │
│   │     hand.                                            │ │
│   ├──────────────────────────────────────────────────────┤ │
│   │ ⚠  legacy-cd                                         │ │
│   │     Last read 40 days ago, before the last value     │ │
│   │     change. It is caching the old value, or it is    │ │
│   │     dead.                                            │ │
│   ├──────────────────────────────────────────────────────┤ │
│   │ ⚠  /staging/api                                       │ │
│   │     Imports this path. Staging will change too.      │ │
│   └──────────────────────────────────────────────────────┘ │
│                                                            │
│   ── But it is overdue ──                                  │
│   · 2 people who read this value cannot read it today       │
│   · Value unchanged for 14 months                           │
│   · Not managed by an automatic rotation                    │
│                                                            │
│   ✓  4 destinations and 6 consumers will pick up the new   │
│      value automatically.                                  │
│                                                            │
│                          [ Close ]  [ Fix Sync Issues → ]  │
└────────────────────────────────────────────────────────────┘
```

Notes:

- **The verdict is a sentence, not a gauge.** No speedometers, no percentage rings. "Not safe to rotate, 4 things will break" is the design.
- Impacts are ordered by severity, blocking first. Each is one plain sentence naming the thing and the consequence. Copy is part of this design; it should read like a colleague talking.
- **The modal is two-sided, and this is the most important thing about it.** The top half is the risk of acting (what breaks). The "But it is overdue" block is the risk of *not* acting: ghost readers, an old value, no automatic rotation. A secret is very often both risky to rotate and overdue for rotation, which is the real situation most teams are in and the thing no tool currently says out loud. The design must not let the blocking list bury the overdue list, because a user who reads only the top half will correctly conclude "do nothing" and that is the wrong outcome.
- Always include the reassuring counterpart at the bottom. A list of only problems reads as broken; the "will pick up automatically" line tells the user what they do *not* have to worry about.
- Design all three verdict states: red (blocking), amber (proceed with care), green (safe, and it should feel genuinely calm rather than empty). Note that green plus a populated overdue block is a common and important combination: nothing will break, and you should do it now.

---

### S4. Table mode

Graphs are bad at "give me the list of 40 identities." The toggle in the header switches to a dense table. Columns: Principal, Type, Actions, Grant Path (collapsed to a one-line summary with a "why" affordance that opens the same Explain panel), Last Read, Reads, Precision.

An existing access-list table in the product covers most of this pattern, so this screen is mostly about the two new columns (Grant Path, and the observed pair) and about keeping the Explain panel consistent across both modes.

---

### S5. Healthy state

Design this deliberately. It is the most common state for a well-managed secret, and if it looks like a broken page then the feature punishes the users who are doing it right.

Two admins, no syncs, no surprises. Exposure score low. The graph is nearly empty and that is the *good* outcome, so the composition needs to feel affirmative and finished rather than like a failed load. A short sentence carries it: "Two admins can read this. Nothing else touches it."

---

### S6. Loading and progressive paint

The entitlement and distribution data arrive fast. The observed-consumption data comes from the audit log and is slower.

- **Initial**: skeleton nodes in the three bands, no edges. Not a spinner over an empty canvas.
- **First paint**: all nodes and all edges drawn **dashed**, with a subtle "Checking activity" indicator near the legend.
- **Consumption arrives**: edges that were actually observed **upgrade from dashed to solid**, and read counts appear on the nodes.

That upgrade is the one place in this feature where motion earns its keep, because the transition *is* the insight: you watch the real usage light up out of the theoretical access. Keep it inside the 200ms house rule and stagger it lightly. Do not make it a showpiece.

Also design the **truncated** banner: when the graph caps nodes on a very large project, say so explicitly ("Showing 50 of 214 principals"). Silent truncation reads as completeness and is worse than useless during an incident.

---

### S7. Entry points

Two small pieces of surface:

1. **Secret row menu item** labeled "Blast Radius", sitting beside the existing access-insights item in the secret table row overflow menu.
2. **Insights page card** titled "Most Exposed Secrets": a ranked list of ten secrets with a score, a band chip, and a one-line driver. This is what pulls a security engineer back into the product weekly, so the card should feel scannable and ranked, not chart-y.

---

### S8. Component sheet

A single artboard with the atomic pieces, since consistency across states matters more than any individual screen:

- **Principal node**, three types (user, machine identity, group), with the badge set: Read Value, Describe Only, via group, expires in 3h, no reads 30d, admin, folder-level precision
- **Ghost reader node**, in both states (Access revoked, Deleted). Visually adjacent to principal nodes but unmistakably a different category, and with no edge to the secret
- **Client badges** for how a principal read it: web, cli, k8s, terraform, sdk. Show two plus an overflow count
- **Secret node** (center, larger, distinct), with the rotation-managed and approval-policy markers
- **Destination node**, with provider label and status dot in all three states (synced, stale, failed), plus the cross-project variant
- **Cluster node** collapsed with count, and its expand affordance
- **Edges**: observed (solid, three thickness steps for read volume), entitled-unused (dashed), and the three action colors
- **Legend**
- **Exposure score card** in all three bands

Node width around 200 to 240px so labels do not truncate at default zoom. Nodes must stay legible when a full graph is fitted to a 1440px canvas, which is the real constraint: this gets demoed on a projector.

---

## 5. UX flows

### Flow A: pre-rotation check (Sofia, two minutes)

1. Secret table, overflow menu on `DB_PASSWORD`, "Blast Radius"
2. Screen loads, she glances at the score (74, High) and ignores the graph
3. Clicks Simulate Rotation
4. Reads four impacts, recognizes two she can fix
5. Clicks through to the failing sync, fixes it, comes back, re-simulates, gets amber
6. Rotates

Design implication: **the header must be usable without touching the graph.** Score, counts, and Simulate Rotation are all above the canvas for exactly this reason.

### Flow B: access review (Marcus, twenty minutes)

1. Insights page, "Most Exposed Secrets" card, clicks the top row
2. Graph loads, he checks "Hide never-used" off and immediately sees the dashed cluster
3. Clicks the `SRE` group node, expands to 8 members
4. Clicks an edge to a contractor, Explain panel shows: member of SRE, role prod-reader, rule `secretPath $GLOB /prod/**`
5. Recognizes the glob is too broad, clicks Restrict Rule
6. Switches to table mode to export the full list as review evidence

Design implication: **expansion and filtering have to be fast and non-destructive.** He is going to expand, collapse, filter, and re-focus dozens of times in one session. Nothing here should be a modal that loses his place.

### Flow C: incident response (Marcus, 2am)

1. A credential is suspected leaked. He pastes a Blast Radius deep link into Slack
2. Team opens the same view: who could have read it, who actually did, and where it has been pushed
3. Filters to observed-only to get the real exposure list
4. Checks the ghost-reader band, which is the question an incident actually turns on: has anyone who no longer works here read this value
5. Uses the destination band as the containment checklist

Design implication: **the URL is a shareable artifact.** The default state on load from a deep link must be immediately readable by someone who did not set up the filters, and the focus target should be visually obvious.

---

## 6. What to deliver

| Priority | Screen |
| --- | --- |
| 1 | S1 default state, 1440 x 900 |
| 2 | S2 focus mode with Explain panel |
| 3 | S3 Rotation Simulation, all three verdict states |
| 4 | S8 component sheet |
| 5 | S6 progressive paint (first-paint and post-consumption pair) |
| 6 | S5 healthy state |
| 7 | S4 table mode, S7 entry points |

Dark only. Desktop only. No mobile, no light theme, no marketing surface.

---

## 7. Open questions for the designer

1. **Band captions.** "Who can reach it" / "Where it goes" is plain but long. Is there a tighter pair that keeps the plain-language quality? Avoid jargon like "principals" and "sinks" in the UI even though the API uses those words.
2. **Cluster expansion in place versus in the panel.** Expanding a group of 8 inside the canvas is spatially honest but pushes the layout around. Expanding it in the side panel keeps the graph stable but breaks the spatial metaphor. Recommendation welcome.
3. **Read-volume encoding.** Edge thickness is proposed, but thickness has a narrow legible range in a dense graph. Is a count badge on the node the better carrier, with thickness reduced to two steps?
4. **The 200-principal case.** At what point does the graph stop being the right default and the table should win? If there is a threshold, the design should say so rather than letting the graph degrade.
5. **Where ghost readers live.** Proposed as a separated band below the entitled column with no edges. Alternatives: a callout in the header (higher prominence, loses the spatial relationship) or a dedicated tab (cleaner, easier to miss). This group is rare but high-consequence, so the placement question is really about how to make something prominent when it is usually absent.
6. **Person versus client.** When alice reads through both the browser and the CLI, is that one node with two client badges, or two nodes? One node is truthful about identity; two nodes are truthful about behavior. During an incident, the browser read is the interesting one and should not be visually equal to routine CLI traffic.
