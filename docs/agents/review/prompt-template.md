# Documentation Review Pipeline — Prompt Template

Copy the block below, fill in the bracketed fields, and paste it into Claude Code.

Delete any optional lines that don't apply.

---

Read the file at docs/agents/review/orchestrator.md. Those are your instructions for managing a documentation review pipeline. Each agent in the pipeline has its own prompt file in docs/agents/review/ — read the corresponding file when you reach that agent's step. Write all intermediate outputs and final results to docs/output/.

**Task:** Review and validate the document at [file path].

**Topic:** [What the document is about]

**Review Scope (choose one or more):**
- Full review (verification, structure, syntax, links, editorial)
- Verification only (factual accuracy)
- Structure review only
- Syntax cleanup only
- Link review only

**Document Status:** [Draft | Published | Generated draft | Unknown]

**Audience:** [Role — e.g., platform engineer, admin, developer, end user]

**Expected Diataxis Type (optional):** [tutorial | how-to | reference | explanation | leave blank if unknown]

**Source scope (delete one):**
- Internal only: Use only information from this repository. Do not use outside knowledge for product behavior.
- Integration: Use the repository for all product-specific information. Use official external documentation ([list sites, e.g., kubernetes.io]) for third-party tool details.

**Goals (optional):**
- [e.g., "Ensure this doc is safe to publish"]
- [e.g., "Clean up formatting and links"]
- [e.g., "Verify accuracy against current codebase"]

**Additional context (optional, delete if not needed):**
- Related docs: [list any related files]
- Known issues: [anything already suspected to be wrong]
- Special instructions: [e.g., "Do not restructure heavily", "Focus on API accuracy", etc.]

---

## Expected Output

The pipeline should produce:

1. Final patched document (markdown)
2. Review Report
3. Human Review Checklist
4. Flag Summary
5. Pipeline Summary

---

## Notes

- Do not invent product behavior. If something cannot be verified, flag it.
- Prefer flagging over guessing.
- Preserve all existing flags in the document.
- The goal is to produce a **reviewed and trustworthy document**, not a rewritten one.
