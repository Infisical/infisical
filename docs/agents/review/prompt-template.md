# Documentation Review & Remediation Pipeline — Prompt Template

Copy the block below, fill in the bracketed fields, and paste it into Claude Code.

Delete any optional lines that don't apply.

---

Read the file at docs/agents/review/orchestrator.md. These are your instructions for managing the review and remediation pipeline.

Each agent in the pipeline has its own prompt file in docs/agents/review/ — load and follow each agent exactly when invoked.

Write all intermediate outputs and final results to docs/output/.

---

## Task

Review, validate, and (if required) remediate the document at:

[file path]

---

## Context

**Topic:** [What the document is about]  
**Document Status:** [Draft | Published | Generated draft | Unknown]  
**Audience:** [platform engineer | admin | developer | end user]

---

## Review Scope

Choose one:

- Full review + remediation (default)
- Verification only
- Structure review only
- Syntax cleanup only
- Link review only

---

## Expected Diataxis Type (optional)

[tutorial | how-to | reference | explanation | unknown]

---

## Source Scope (REQUIRED — choose one)

- Internal only  
  Use ONLY repository sources for product behavior. Do NOT infer or use external knowledge.

- Integration  
  Use repository for product behavior. Use official external docs for third-party tools:
  [list allowed domains]

---

## Goals (optional)

- [Ensure document is safe to publish]
- [Fix critical accuracy issues]
- [Improve structure and usability]
- [Repair incomplete or broken sections]

---

## Additional Context (optional)

- Related docs: [paths]
- Known issues: [suspected problems]
- Constraints: [e.g., "do not heavily restructure", "preserve tone", etc.]

---

## Execution Rules

- Follow the orchestrator EXACTLY — do not skip agents
- Do NOT invent product behavior
- If something cannot be verified → FLAG IT
- Preserve all existing flags unless resolved
- Fix ALL blocking issues if remediation is triggered
- Do NOT rewrite correct content unnecessarily
- Maintain evidence binding — every claim must be verified or flagged

---

## Expected Output

The pipeline MUST produce:

1. Final remediated document (markdown)
2. Review Report (decision + confidence score)
3. Human Review Checklist
4. Flag Summary
5. Pipeline Summary

---

## Success Criteria

The output is considered successful if:

- No incorrect or unsafe behavior remains
- All critical gaps are resolved OR clearly flagged
- The document is usable by the intended audience
- Remaining uncertainty is explicitly visible

---

## Notes

- Prefer flagging over guessing
- Truth > completeness
- Safe but incomplete > complete but wrong
- This is a **repair system**, not just a review system