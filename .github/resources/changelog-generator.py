#!/usr/bin/env python3
# inspired by https://www.photoroom.com/inside-photoroom/how-we-automated-our-changelog-thanks-to-chatgpt
import os
import re
import subprocess
import sys
from datetime import datetime

import requests

# Constants
REPO_OWNER = "infisical"
REPO_NAME = "infisical"
TOKEN = os.environ.get("GITHUB_TOKEN")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL")
DRY_RUN = os.environ.get("DRY_RUN", "false").lower() == "true"
MODEL = os.environ.get("MODEL", "anthropic/claude-haiku-4.5")

if not OPENROUTER_API_KEY:
    print("Error: OPENROUTER_API_KEY is required", file=sys.stderr)
    sys.exit(1)

if not DRY_RUN and not SLACK_WEBHOOK_URL:
    print("Error: SLACK_WEBHOOK_URL is required", file=sys.stderr)
    sys.exit(1)

headers = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}
if TOKEN:
    headers["Authorization"] = f"Bearer {TOKEN}"


def post_to_slack(tag, changelog):
    message = f"*Changelog for {tag}*\n\n{changelog}"
    response = requests.post(SLACK_WEBHOOK_URL, json={"text": message})

    if response.status_code != 200:
        raise Exception(f"Error posting to Slack: {response.status_code} - {response.text}")


def find_previous_release_tag(release_tag:str):
    # Find the previous stable release tag, excluding nightly tags
    all_tags = subprocess.check_output(
        ["git", "tag", "-l", "--merged", release_tag, "--sort=-version:refname"]
    ).decode("utf-8").strip().split('\n')

    for tag in all_tags:
        if tag == release_tag or "nightly" in tag or not tag:
            continue
        return tag

    raise Exception(f"No previous stable release tag found for {release_tag}. Ensure at least one prior stable release exists.")

def get_tag_creation_date(tag_name):
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/git/refs/tags/{tag_name}"
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    tag_ref = response.json()
    obj_sha = tag_ref['object']['sha']
    obj_type = tag_ref['object']['type']

    # For annotated tags, dereference the tag object to get the commit SHA
    if obj_type == 'tag':
        tag_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/git/tags/{obj_sha}"
        tag_response = requests.get(tag_url, headers=headers)
        tag_response.raise_for_status()
        obj_sha = tag_response.json()['object']['sha']

    commit_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/commits/{obj_sha}"
    commit_response = requests.get(commit_url, headers=headers)
    commit_response.raise_for_status()
    creation_date = commit_response.json()['commit']['author']['date']

    return datetime.strptime(creation_date, '%Y-%m-%dT%H:%M:%SZ')


def fetch_prs_between_tags(previous_tag_date:datetime, release_tag_date:datetime):
    # Use GitHub Search API to fetch PRs merged in the date range.
    # This avoids pagination issues with the pulls endpoint where sorting
    # by 'updated' could cause early termination and miss PRs.
    prs = []
    page = 1

    while True:
        search_url = (
            f"https://api.github.com/search/issues"
            f"?q=repo:{REPO_OWNER}/{REPO_NAME}+is:pr+is:merged"
            f"+merged:{previous_tag_date.strftime('%Y-%m-%dT%H:%M:%SZ')}"
            f"..{release_tag_date.strftime('%Y-%m-%dT%H:%M:%SZ')}"
            f"&per_page=100&page={page}"
        )
        response = requests.get(search_url, headers=headers)

        if response.status_code != 200:
            raise Exception(f"Error fetching PRs from GitHub API: {response.status_code}")

        data = response.json()
        items = data.get('items', [])
        if not items:
            break

        for item in items:
            # Fetch full PR data for each result to get merged_at, head.ref, etc.
            pr_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/pulls/{item['number']}"
            pr_response = requests.get(pr_url, headers=headers)
            pr_response.raise_for_status()
            prs.append(pr_response.json())

        if len(items) < 100:
            break
        page += 1

    return prs


def extract_commit_details_from_prs(prs):
    commit_details = []
    for pr in prs:
        commit_message = pr["title"]
        commit_url = pr["html_url"]
        pr_number = pr["number"]
        branch_name = pr["head"]["ref"]
        issue_numbers = re.findall(r"(www-\d+|web-\d+)", branch_name)

        # If no issue numbers are found, add the PR details without issue numbers and URLs
        if not issue_numbers:
            commit_details.append(
                {
                    "message": commit_message,
                    "pr_number": pr_number,
                    "pr_url": commit_url,
                    "issue_number": None,
                    "issue_url": None,
                }
            )
            continue

        for issue in issue_numbers:
            commit_details.append(
                {
                    "message": commit_message,
                    "pr_number": pr_number,
                    "pr_url": commit_url,
                    "issue_number": issue,
                }
            )

    return commit_details

def generate_changelog_with_claude(commit_details):
    commit_messages = []
    for details in commit_details:
        base_message = f"{details['pr_url']} - {details['message']}"
        commit_messages.append(base_message)

    commit_list = "\n".join(commit_messages)

    prompt = """Generate a changelog for Infisical, an open-source secrets management platform.

Using the provided list of merged PRs, categorize them under these headers (in this order, only include a category if there are entries for it):

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
2. Every entry MUST be self-describing as if no category heading exists. Instead of "Support of CentOS", write "Support CentOS". Instead of "Document the read() method" write "Document the read() method".
3. Each entry should be a single bullet point with the full PR URL at the end: `- Description (https://github.com/Infisical/infisical/pull/PR_NUMBER)`
4. REMOVE non-interesting maintenance changes that are NOT useful to users. This includes: dependency version bumps, CI/CD pipeline config tweaks, minor typo fixes, build script changes, test-only changes.
5. Do NOT remove: refactorings, changes to supported runtime environments, code style changes that use new language features, new or updated documentation.
6. Stay consistent in phrasing across all entries.
7. Sort entries within each category by importance (most impactful first).
8. Do NOT include any introductory or concluding text. Output ONLY the categorized list.
9. Do NOT wrap the output in a code block.

Here are the merged PRs:
{}""".format(commit_list)

    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
    }

    response = requests.post(url, json=payload, headers=headers)

    if response.status_code != 200:
        raise Exception(f"Error calling OpenRouter API: {response.status_code} - {response.text}")

    data = response.json()
    if "error" in data:
        raise Exception(f"OpenRouter API error: {data['error']}")

    return data["choices"][0]["message"]["content"].strip()


if __name__ == "__main__":
    try:
        # Get the latest and previous release tags
        # RELEASE_TAG env var is used when triggered via workflow_dispatch
        latest_tag = os.environ.get("RELEASE_TAG") or subprocess.check_output(["git", "describe", "--tags", "--abbrev=0"]).decode("utf-8").strip()
        previous_tag = find_previous_release_tag(latest_tag)

        if DRY_RUN:
            print(f"📋 DRY RUN MODE")
            print(f"Release tag: {latest_tag}")
            print(f"Previous tag: {previous_tag}")
            print()

        latest_tag_date = get_tag_creation_date(latest_tag)
        previous_tag_date = get_tag_creation_date(previous_tag)

        if DRY_RUN:
            print(f"Date range: {previous_tag_date} to {latest_tag_date}")
            print()

        prs = fetch_prs_between_tags(previous_tag_date, latest_tag_date)

        if DRY_RUN:
            print(f"Found {len(prs)} PRs")
            print()

        pr_details = extract_commit_details_from_prs(prs)

        # Generate changelog using Claude via OpenRouter
        changelog = generate_changelog_with_claude(pr_details)

        if DRY_RUN:
            print("=" * 60)
            print("GENERATED CHANGELOG:")
            print("=" * 60)
            print(changelog)
            print("=" * 60)
        else:
            post_to_slack(latest_tag, changelog)

    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)
