#!/usr/bin/env python3
"""
Release Notes Generator

Fetches commits between two Git tags, sends them to Claude API
for categorization and rewriting, and outputs Keep a Changelog
formatted release notes.

Usage:
  # Auto-detect latest two tags
  python generate_release_notes.py

  # Specify range
  python generate_release_notes.py --from-tag v2.0.0 --to-tag v2.1.0

  # Output to specific destinations
  python generate_release_notes.py --output github changelog stdout

  # Dry run
  python generate_release_notes.py --dry-run

Environment variables (set via GitHub Secrets in CI):
  ANTHROPIC_API_KEY  - Claude API key
  GITHUB_TOKEN       - GitHub token (for GitHub Release updates)
  GITHUB_REPOSITORY  - owner/repo (auto-set in GitHub Actions)
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CLAUDE_MODEL = "claude-opus-4-6"
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
CATEGORIES_IN_ORDER = ["Changed", "Added", "Removed", "Fixed"]

SYSTEM_PROMPT = """\
You are a release notes editor. You will receive a list of Git commits \
(subject + optional body) for a software release.

Your job:

1. **Categorize** each meaningful commit into exactly one of these categories \
(in this order):
   - Changed — changes in existing functionality
   - Added — new functionality
   - Removed — removed functionality
   - Fixed — bug fixes

2. **Rewrite** each entry:
   - Use imperative mood, starting with a present-tense verb \
(e.g. "Add", "Fix", "Remove", "Change", "Refactor", "Drop")
   - Make each entry self-describing — a reader should understand the change \
without looking at the code
   - Stay consistent in phrasing across all entries

3. **Filter noise** — exclude non-interesting maintenance changes such as:
   - Dependency bumps (e.g. "Bump eslint from 8.1 to 8.2")
   - CI config tweaks (e.g. "Update .github/workflows/ci.yml")
   - Merge commits (e.g. "Merge branch 'main' into feature")
   - Chore-only changes with no user-facing impact

   **Do NOT exclude** (these are interesting):
   - Refactorings
   - Changes to supported runtime environments (e.g. dropping Node 14)
   - Code style changes that use new language features
   - New or updated documentation

4. **Output format** — respond with ONLY a JSON object, no markdown fences:
{
  "Changed": ["entry1", "entry2"],
  "Added": ["entry1"],
  "Removed": [],
  "Fixed": ["entry1"]
}

If a category has no entries, use an empty array. Do not add categories \
beyond the four listed."""


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------

def run(cmd: str) -> str:
    result = subprocess.run(
        cmd, shell=True, capture_output=True, text=True, check=True
    )
    return result.stdout.strip()


def get_tags() -> tuple[str, str]:
    """Return (previous_tag, latest_tag) sorted by version."""
    raw = run("git tag --sort=-v:refname")
    tags = [t for t in raw.splitlines() if t.strip()]
    if len(tags) < 2:
        raise SystemExit(f"Need at least 2 tags. Found {len(tags)}: {tags}")
    return tags[1], tags[0]


def get_commits(from_tag: str, to_tag: str) -> list[dict]:
    sep = "---COMMIT_SEP---"
    fmt = f"%s|||%b{sep}"
    raw = run(f'git log {from_tag}..{to_tag} --pretty=format:"{fmt}" --no-merges')

    commits = []
    for block in raw.split(sep):
        block = block.strip()
        if not block:
            continue
        parts = block.split("|||", 1)
        subject = parts[0].strip().strip('"')
        body = parts[1].strip() if len(parts) > 1 else ""
        if subject:
            commits.append({"subject": subject, "body": body})
    return commits


def get_repo_slug() -> str | None:
    slug = os.environ.get("GITHUB_REPOSITORY")
    if slug:
        return slug
    try:
        url = run("git remote get-url origin")
        match = re.search(r"github\.com[:/](.+?)(?:\.git)?$", url)
        return match.group(1) if match else None
    except subprocess.CalledProcessError:
        return None


# ---------------------------------------------------------------------------
# Claude API
# ---------------------------------------------------------------------------

def classify_commits(commits: list[dict]) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise SystemExit("ANTHROPIC_API_KEY environment variable is required")

    commit_text = "\n".join(
        f"{i+1}. {c['subject']}{chr(10) + '   ' + c['body'] if c['body'] else ''}"
        for i, c in enumerate(commits)
    )

    payload = json.dumps({
        "model": CLAUDE_MODEL,
        "max_tokens": 2048,
        "system": SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": f"Here are the commits for this release:\n\n{commit_text}",
            }
        ],
    }).encode()

    req = Request(
        ANTHROPIC_API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    try:
        with urlopen(req) as resp:
            data = json.loads(resp.read())
    except HTTPError as e:
        body = e.read().decode()
        raise SystemExit(f"Claude API error {e.code}: {body}")

    text = "".join(b.get("text", "") for b in data["content"])
    text = re.sub(r"```json|```", "", text).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise SystemExit(f"Failed to parse Claude response as JSON: {e}\n{text}")


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------

def format_markdown(categories: dict, tag: str, release_date: str) -> str:
    lines = [f"## [{tag}] - {release_date}", ""]

    for cat in CATEGORIES_IN_ORDER:
        entries = categories.get(cat, [])
        if not entries:
            continue
        lines.append(f"### {cat}")
        lines.append("")
        for entry in entries:
            lines.append(f"- {entry}")
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Output destinations
# ---------------------------------------------------------------------------

def github_api(method: str, url: str, body: dict | None = None) -> dict:
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("GITHUB_TOKEN environment variable is required for --output github")

    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
    }
    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, headers=headers, method=method)

    try:
        with urlopen(req) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        err_body = e.read().decode()
        raise SystemExit(f"GitHub API error {e.code}: {err_body}")


def write_to_github(markdown: str, tag: str, repo: str):
    if not repo:
        raise SystemExit("Could not determine GitHub repository slug")

    base = f"https://api.github.com/repos/{repo}/releases"

    try:
        release = github_api("GET", f"{base}/tags/{tag}")
        github_api("PATCH", f"{base}/{release['id']}", {"body": markdown})
        print(f"✅ Updated GitHub Release for {tag}")
    except SystemExit:
        github_api("POST", base, {
            "tag_name": tag,
            "name": tag,
            "body": markdown,
        })
        print(f"✅ Created GitHub Release for {tag}")


def write_to_changelog(markdown: str):
    path = Path("CHANGELOG.md")
    header = "# Changelog\n\n"

    if path.exists():
        existing = path.read_text()
        marker = existing.find("\n\n")
        if marker != -1:
            updated = existing[: marker + 2] + markdown + "\n" + existing[marker + 2 :]
        else:
            updated = header + markdown + "\n" + existing
        path.write_text(updated)
    else:
        path.write_text(header + markdown)

    print(f"✅ Updated {path}")


# ---------------------------------------------------------------------------
# GitHub Actions output helper
# ---------------------------------------------------------------------------

def set_actions_output(key: str, value: str):
    output_file = os.environ.get("GITHUB_OUTPUT")
    if output_file:
        with open(output_file, "a") as f:
            delimiter = "EOF_RELEASE_NOTES"
            f.write(f"{key}<<{delimiter}\n{value}\n{delimiter}\n")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Generate release notes with Claude")
    p.add_argument("--from-tag", default=None, help="Start tag (exclusive)")
    p.add_argument("--to-tag", default=None, help="End tag (inclusive)")
    p.add_argument(
        "--output",
        nargs="+",
        default=["stdout"],
        choices=["stdout", "github", "changelog"],
        help="Output destinations (default: stdout)",
    )
    p.add_argument("--dry-run", action="store_true", help="Print without writing")
    return p.parse_args()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = parse_args()

    from_tag = args.from_tag
    to_tag = args.to_tag
    if not from_tag or not to_tag:
        detected_from, detected_to = get_tags()
        from_tag = from_tag or detected_from
        to_tag = to_tag or detected_to

    print(f"📦 Generating release notes for {from_tag}..{to_tag}\n")

    commits = get_commits(from_tag, to_tag)
    print(f"📝 Found {len(commits)} commits\n")

    if not commits:
        print("No commits found in range. Exiting.")
        sys.exit(0)

    print("🤖 Sending to Claude for categorization...\n")
    categories = classify_commits(commits)

    markdown = format_markdown(categories, to_tag, date.today().isoformat())

    if args.dry_run:
        print("--- DRY RUN ---\n")
        print(markdown)
        return

    repo = get_repo_slug()

    for dest in args.output:
        if dest == "stdout":
            print(markdown)
        elif dest == "github":
            write_to_github(markdown, to_tag, repo)
        elif dest == "changelog":
            write_to_changelog(markdown)

    set_actions_output("release_notes", markdown)


if __name__ == "__main__":
    main()