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
SLACK_WEBHOOK_URL = os.environ["SLACK_WEBHOOK_URL"]
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
    previous_tag = subprocess.check_output(["git", "describe", "--tags", "--abbrev=0", f"{release_tag}^"]).decode("utf-8").strip()
    while not(previous_tag.startswith("infisical/")):
        previous_tag = subprocess.check_output(["git", "describe", "--tags", "--abbrev=0", f"{previous_tag}^"]).decode("utf-8").strip()
    return previous_tag

def get_tag_creation_date(tag_name):
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/git/refs/tags/{tag_name}"
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    commit_sha = response.json()['object']['sha']
    
    commit_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/commits/{commit_sha}"
    commit_response = requests.get(commit_url, headers=headers)
    commit_response.raise_for_status()
    creation_date = commit_response.json()['commit']['author']['date']

    return datetime.strptime(creation_date, '%Y-%m-%dT%H:%M:%SZ')


def fetch_prs_between_tags(previous_tag_date:datetime, release_tag_date:datetime):
    # Use GitHub API to fetch PRs merged between the commits
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/pulls?state=closed&merged=true"
    response = requests.get(url, headers=headers)

    if response.status_code != 200:
        raise Exception("Error fetching PRs from GitHub API!")

    prs = []
    for pr in response.json():
        # the idea is as tags happen recently we get last 100 closed PRs and then filter by tag creation date
        if pr["merged_at"] and datetime.strptime(pr["merged_at"],'%Y-%m-%dT%H:%M:%SZ') < release_tag_date and  datetime.strptime(pr["merged_at"],'%Y-%m-%dT%H:%M:%SZ') > previous_tag_date:
            prs.append(pr)

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
    prompt = """
Generate a changelog for Infisical, opensource secretops
The changelog should:
1. Be Informative: Using the provided list of GitHub commits, break them down into categories such as Features, Fixes & Improvements, and Technical Updates. Summarize each commit concisely, ensuring the key points are highlighted.
2. Have a Professional yet Friendly tone: The tone should be balanced, not too corporate or too informal.
3. Celebratory Introduction and Conclusion: Start the changelog with a celebratory note acknowledging the team's hard work and progress. End with a shoutout to the team and wishes for a pleasant weekend.
4. Formatting: you cannot use Markdown formatting, and you can only use emojis for the introductory paragraph or the conclusion paragraph, nowhere else.
5. Links: the syntax to create links is the following: `<http://www.example.com|This message is a link>`.
6. Linear Links: note that the Linear link is optional, include it only if provided.
7. Do not wrap your answer in a codeblock. Just output the text, nothing else
Here's a good example to follow, please try to match the formatting as closely as possible, only changing the content of the changelog and have some liberty with the introduction. Notice the importance of the formatting of a changelog item:
- <https://github.com/facebook/react/pull/27304/%7C#27304>: We optimize our ci to strip comments and minify production builds. (<https://linear.app/example/issue/WEB-1234/%7CWEB-1234>))
And here's an example of the full changelog:

*Features*
• <https://github.com/facebook/react/pull/27304/%7C#27304>: We optimize our ci to strip comments and minify production builds. (<https://linear.app/example/issue/WEB-1234/%7CWEB-1234>)
*Fixes & Improvements*
• <https://github.com/facebook/react/pull/27304/%7C#27304>: We optimize our ci to strip comments and minify production builds. (<https://linear.app/example/issue/WEB-1234/%7CWEB-1234>)
*Technical Updates*
• <https://github.com/facebook/react/pull/27304/%7C#27304>: We optimize our ci to strip comments and minify production builds. (<https://linear.app/example/issue/WEB-1234/%7CWEB-1234>)

Stay tuned for more exciting updates coming soon!
And here are the commits:
{}
    """.format(
        commit_list
    )

    client  = OpenAI(api_key=OPENAI_API_KEY)
    messages = [{"role": "user", "content": prompt}]
    response = client.chat.completions.create(model="gpt-3.5-turbo", messages=messages)

    if "error" in response.choices[0].message:
        raise Exception("Error generating changelog with OpenAI!")

    return response.choices[0].message.content.strip()


if __name__ == "__main__":
    try:
        # Get the latest and previous release tags
        latest_tag = subprocess.check_output(["git", "describe", "--tags", "--abbrev=0"]).decode("utf-8").strip()
        previous_tag = find_previous_release_tag(latest_tag)

        latest_tag_date = get_tag_creation_date(latest_tag)
        previous_tag_date = get_tag_creation_date(previous_tag)

        prs = fetch_prs_between_tags(previous_tag_date,latest_tag_date)
        pr_details = extract_commit_details_from_prs(prs)

        # Generate changelog
        changelog = generate_changelog_with_openai(pr_details)

        post_changelog_to_slack(changelog,latest_tag)
        # Print or post changelog to Slack
        # set_multiline_output("changelog", changelog)

    except Exception as e:
        print(str(e))