"""
Generate a categorized changelog for GitHub Releases using OpenAI.

Categories follow Common Changelog conventions:
- Changed: changes in existing functionality
- Added: new functionality
- Removed: removed functionality
- Fixed: bug fixes

All entries are written in imperative mood, starting with a present tense verb.
Non-interesting maintenance changes are filtered out, but refactorings,
runtime environment changes, code style improvements, and documentation are kept.

Usage:
  python release-changelog-generator.py

Required environment variables:
  GITHUB_TOKEN        - GitHub API token
  OPENAI_API_KEY      - OpenAI API key
  RELEASE_TAG         - The tag for this release (e.g. v0.152.0)

Optional environment variables:
  PREVIOUS_TAG        - Override the previous tag to diff against (auto-detected if not set)
  GITHUB_OUTPUT       - Path to GitHub Actions output file (for setting outputs)
"""

import os
import re
import subprocess
import sys
import uuid
from datetime import datetime

import requests
from openai import OpenAI

REPO_OWNER = "Infisical"
REPO_NAME = "infisical"
TOKEN = os.environ["GITHUB_TOKEN"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


def set_github_output(name, value):
    """Write a multiline value to GITHUB_OUTPUT for use in subsequent workflow steps."""
    output_file = os.environ.get("GITHUB_OUTPUT")
    if not output_file:
        return
    with open(output_file, "a") as fh:
        delimiter = uuid.uuid1()
        print(f"{name}<<{delimiter}", file=fh)
        print(value, file=fh)
        print(delimiter, file=fh)


def find_previous_tag(release_tag: str) -> str:
    """Find the previous release tag by walking back through git tags.

    For production tags (v*.*.*), finds the previous production tag.
    For nightly tags (v*.*.*-nightly-*), finds the previous nightly or production tag.
    """
    is_nightly = "nightly" in release_tag

    previous_tag = (
        subprocess.check_output(
            ["git", "describe", "--tags", "--abbrev=0", f"{release_tag}^"]
        )
        .decode("utf-8")
        .strip()
    )

    if is_nightly:
        # For nightly, accept any v*.*.* tag (nightly or production)
        while not re.match(r"^v\d+\.\d+\.\d+", previous_tag):
            previous_tag = (
                subprocess.check_output(
                    ["git", "describe", "--tags", "--abbrev=0", f"{previous_tag}^"]
                )
                .decode("utf-8")
                .strip()
            )
    else:
        # For production, find the previous production tag (skip nightlies)
        while not re.match(r"^v\d+\.\d+\.\d+$", previous_tag):
            previous_tag = (
                subprocess.check_output(
                    ["git", "describe", "--tags", "--abbrev=0", f"{previous_tag}^"]
                )
                .decode("utf-8")
                .strip()
            )

    return previous_tag


def get_tag_date(tag_name: str) -> datetime:
    """Get the creation date of a tag by looking up its commit."""
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/git/refs/tags/{tag_name}"
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    commit_sha = response.json()["object"]["sha"]

    commit_url = (
        f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/commits/{commit_sha}"
    )
    commit_response = requests.get(commit_url, headers=headers)
    commit_response.raise_for_status()
    creation_date = commit_response.json()["commit"]["author"]["date"]

    return datetime.strptime(creation_date, "%Y-%m-%dT%H:%M:%SZ")


def fetch_prs_between_dates(
    after_date: datetime, before_date: datetime
) -> list[dict]:
    """Fetch merged PRs between two dates using the GitHub API.

    Paginates through results to ensure all PRs are captured.
    """
    all_prs = []
    page = 1

    while True:
        url = (
            f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/pulls"
            f"?state=closed&sort=updated&direction=desc&per_page=100&page={page}"
        )
        response = requests.get(url, headers=headers)

        if response.status_code != 200:
            raise Exception(f"Error fetching PRs from GitHub API: {response.status_code}")

        prs = response.json()
        if not prs:
            break

        found_older = False
        for pr in prs:
            if not pr.get("merged_at"):
                continue
            merged_at = datetime.strptime(pr["merged_at"], "%Y-%m-%dT%H:%M:%SZ")
            if merged_at <= after_date:
                found_older = True
                continue
            if merged_at < before_date:
                all_prs.append(pr)

        # If we've gone past the date range, stop paginating
        if found_older:
            break

        page += 1

    return all_prs


def format_pr_list(prs: list[dict]) -> str:
    """Format PRs into a simple list for the OpenAI prompt."""
    lines = []
    for pr in prs:
        title = pr["title"]
        url = pr["html_url"]
        number = pr["number"]
        labels = [label["name"] for label in pr.get("labels", [])]
        label_str = f" [labels: {', '.join(labels)}]" if labels else ""
        lines.append(f"- #{number} ({url}): {title}{label_str}")
    return "\n".join(lines)


CHANGELOG_PROMPT = """You are generating a changelog entry for the Infisical GitHub Release page.
Infisical is an open-source secrets management platform.

Format the changelog using GitHub Markdown with these exact category headers (in this order).
Only include a category if there are entries for it:

### Changed
(changes in existing functionality)

### Added
(new functionality)

### Removed
(removed functionality)

### Fixed
(bug fixes)

Rules:
1. Every entry MUST be written in imperative mood, starting with a present tense verb (e.g. "Add", "Fix", "Remove", "Refactor", "Update", "Improve", "Support", "Document").
2. Every entry MUST be self-describing as if no category heading exists. Instead of "Support of CentOS", write "Support CentOS". Instead of "Documentation for read()", write "Document the read() method".
3. Each entry should be a single bullet point: `- Description (#PR_NUMBER)`
4. REMOVE non-interesting maintenance changes that are NOT interesting to users. This includes: dependency version bumps, CI/CD pipeline config tweaks, minor typo fixes, build script changes, test-only changes.
5. Do NOT remove: refactorings, changes to supported runtime environments, code style changes that use new language features, new or updated documentation.
6. Stay consistent in phrasing across all entries.
7. Sort entries within each category by importance (most impactful first).
8. Do NOT include any introductory or concluding text, celebratory messages, or commentary. Output ONLY the categorized list.
9. Do NOT wrap the output in a code block. Just output the raw markdown.

Here are the merged PRs for this release:

{}
"""


def generate_changelog(prs: list[dict]) -> str:
    """Send the PR list to OpenAI and get a categorized changelog back."""
    pr_list = format_pr_list(prs)

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": CHANGELOG_PROMPT.format(pr_list)}],
        temperature=0.3,
    )

    content = response.choices[0].message.content
    if not content:
        raise Exception("OpenAI returned an empty response")

    return content.strip()


def main():
    release_tag = os.environ.get("RELEASE_TAG")
    if not release_tag:
        print("ERROR: RELEASE_TAG environment variable is required")
        sys.exit(1)

    previous_tag = os.environ.get("PREVIOUS_TAG")

    print(f"Release tag: {release_tag}")

    if not previous_tag:
        previous_tag = find_previous_tag(release_tag)

    print(f"Previous tag: {previous_tag}")

    release_date = get_tag_date(release_tag)
    previous_date = get_tag_date(previous_tag)

    print(f"Fetching PRs merged between {previous_date} and {release_date}...")

    prs = fetch_prs_between_dates(previous_date, release_date)
    print(f"Found {len(prs)} merged PRs")

    if not prs:
        changelog = "_No notable changes in this release._"
    else:
        changelog = generate_changelog(prs)

    print("\n--- Generated Changelog ---")
    print(changelog)
    print("--- End Changelog ---\n")

    set_github_output("changelog", changelog)


if __name__ == "__main__":
    main()
