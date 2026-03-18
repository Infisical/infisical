# Documentation Pipeline — Prompt Template

Copy the block below, fill in the bracketed fields, and paste it into Claude Code.

Delete any optional lines that don't apply.

---

Read the file at docs/agents/orchestrator.md. Those are your instructions for managing a documentation pipeline. Each agent in the pipeline has its own prompt file in docs/agents/ — read the corresponding file when you reach that agent's step. Write all intermediate outputs and the final draft to docs/output/.

**Task:** Produce a [tutorial | how-to | reference | explanation] for [what you are documenting].

**Audience:** [Role — e.g., platform engineer, admin, developer, end user] who needs to [what they are trying to accomplish].

**Scope:** Cover the following: [list the specific things the doc should cover, e.g., "configuring auth, creating the resource, verifying the setup"]. Do not cover: [anything explicitly out of scope, or delete this line].

**Source scope (delete one):**
- Internal only: Use only information from this repository. Do not use outside knowledge for product behavior.
- Integration: Use the repository for all product-specific information. Use official external documentation ([list sites, e.g., external-secrets.io, kubernetes.io]) for third-party tool details.

**Additional context (optional, delete if not needed):**
- Existing related docs: [list any existing docs this should link to or be aware of]
- Known gaps: [anything you already know is missing from the codebase that the agent will need to flag]
- Special instructions: [any one-off requirements, e.g., "this replaces the existing deprecated guide at /docs/guides/old-page.md"]

---

## Quick Reference — Diataxis Types

Pick the one that matches what the reader needs:

- **Tutorial** — "Teach me." The reader is new and needs to be walked through a complete learning experience from scratch.
- **How-to** — "Help me do this." The reader knows the basics and needs steps to accomplish a specific task.
- **Reference** — "Give me the details." The reader needs to look up a specific parameter, endpoint, option, or behavior.
- **Explanation** — "Help me understand." The reader needs to understand why something works the way it does.

If you're unsure, leave the type blank and add: "Let the Structure Agent determine the appropriate Diataxis type."
