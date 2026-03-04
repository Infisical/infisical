# inspired by https://www.photoroom.com/inside-photoroom/how-we-automated-our-changelog-thanks-to-chatgpt
import os
import requests
import re
from openai import OpenAI
import subprocess
from datetime import datetime

import uuid

# Constants
REPO_OWNER = "infisical"
REPO_NAME = "infisical"
TOKEN = os.environ["GITHUB_TOKEN"]
SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL")
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
SLACK_MSG_COLOR = "#36a64f"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


def set_multiline_output(name, value):
    with open(os.environ['GITHUB_OUTPUT'], 'a') as fh:
        delimiter = uuid.uuid1()
        print(f'{name}<<{delimiter}', file=fh)
        print(value, file=fh)
        print(delimiter, file=fh)

def post_changelog_to_slack(changelog, tag):
    slack_payload = {
        "text": "Hey team, it's changelog time! :wave:",
        "attachments": [
            {
                "color": SLACK_MSG_COLOR,
                "title": f"🗓️Infisical Changelog - {tag}",
                "text": changelog,
            }
        ],
    }

    response = requests.post(SLACK_WEBHOOK_URL, json=slack_payload)

    if response.status_code != 200:
        raise Exception("Failed to post changelog to Slack.")

def find_previous_release_tag(release_tag:str):
    tag_prefix = os.environ.get("TAG_PREFIX", "infisical/")
    previous_tag = subprocess.check_output(["git", "describe", "--tags", "--abbrev=0", f"{release_tag}^"]).decode("utf-8").strip()
    while not(previous_tag.startswith(tag_prefix)):
        previous_tag = subprocess.check_output(["git", "describe", "--tags", "--abbrev=0", f"{previous_tag}^"]).decode("utf-8").strip()
    return previous_tag

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
            if pr_response.status_code == 200:
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

# Function to generate changelog using OpenAI
def generate_changelog_with_openai(commit_details):
    commit_messages = []
    for details in commit_details:
        base_message = f"{details['pr_url']} - {details['message']}"
        # Add the issue URL if available
        # if details["issue_url"]:
        #     base_message += f" (Linear Issue: {details['issue_url']})"
        commit_messages.append(base_message)

    commit_list = "\n".join(commit_messages)
    output_format = os.environ.get("OUTPUT_FORMAT", "slack")

    if output_format == "github":
        prompt = """
Generate a changelog for Infisical, an open-source secrets management platform.

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
2. Every entry MUST be self-describing as if no category heading exists. Instead of "Support of CentOS", write "Support CentOS". Instead of "Documentation for read()", write "Document the read() method".
3. Each entry should be a single bullet point referencing the PR: `- Description (#PR_NUMBER)`
4. REMOVE non-interesting maintenance changes that are NOT useful to users. This includes: dependency version bumps, CI/CD pipeline config tweaks, minor typo fixes, build script changes, test-only changes.
5. Do NOT remove: refactorings, changes to supported runtime environments, code style changes that use new language features, new or updated documentation.
6. Stay consistent in phrasing across all entries.
7. Sort entries within each category by importance (most impactful first).
8. Do NOT include any introductory or concluding text. Output ONLY the categorized list.
9. Do NOT wrap the output in a code block.

Here are the merged PRs:
{}
""".format(commit_list)
    else:
        prompt = """
Generate a changelog for Infisical, an open-source secrets management platform.

Using the provided list of merged PRs, categorize them under these headers (in this order, only include a category if there are entries for it):

*Changed*
(changes in existing functionality)

*Added*
(new functionality)

*Removed*
(removed functionality)

*Fixed*
(bug fixes)

Rules:
1. Every entry MUST be written in imperative mood, starting with a present tense verb (e.g. "Add", "Fix", "Remove", "Refactor", "Update", "Improve", "Support", "Document").
2. Every entry MUST be self-describing as if no category heading exists. Instead of "Support of CentOS", write "Support CentOS". Instead of "Documentation for read()", write "Document the read() method".
3. Each entry should be a single bullet point referencing the PR link: `• <PR_URL|#PR_NUMBER>: Description`
4. REMOVE non-interesting maintenance changes that are NOT useful to users. This includes: dependency version bumps, CI/CD pipeline config tweaks, minor typo fixes, build script changes, test-only changes.
5. Do NOT remove: refactorings, changes to supported runtime environments, code style changes that use new language features, new or updated documentation.
6. Stay consistent in phrasing across all entries.
7. Sort entries within each category by importance (most impactful first).
8. Do NOT include any introductory or concluding text. Output ONLY the categorized list.
9. Do NOT wrap the output in a code block.
10. Links: use the Slack link syntax `<http://www.example.com|This message is a link>`.

Here are the merged PRs:
{}
""".format(commit_list)

    client  = OpenAI(api_key=OPENAI_API_KEY)
    messages = [{"role": "user", "content": prompt}]
    response = client.chat.completions.create(model="gpt-3.5-turbo", messages=messages)

    if "error" in response.choices[0].message:
        raise Exception("Error generating changelog with OpenAI!")

    return response.choices[0].message.content.strip()


if __name__ == "__main__":
    try:
        # Get the latest and previous release tags
        # RELEASE_TAG env var is used when triggered via workflow_dispatch
        latest_tag = os.environ.get("RELEASE_TAG") or subprocess.check_output(["git", "describe", "--tags", "--abbrev=0"]).decode("utf-8").strip()
        previous_tag = find_previous_release_tag(latest_tag)

        latest_tag_date = get_tag_creation_date(latest_tag)
        previous_tag_date = get_tag_creation_date(previous_tag)

        prs = fetch_prs_between_tags(previous_tag_date,latest_tag_date)
        pr_details = extract_commit_details_from_prs(prs)

        # Generate changelog
        changelog = generate_changelog_with_openai(pr_details)

        if SLACK_WEBHOOK_URL:
            post_changelog_to_slack(changelog,latest_tag)

        if os.environ.get('GITHUB_OUTPUT'):
            set_multiline_output("changelog", changelog)

    except Exception as e:
        print(str(e))
