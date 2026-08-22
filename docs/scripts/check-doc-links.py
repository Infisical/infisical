#!/usr/bin/env python3
"""Supplementary docs link check.

Covers the gaps in `mint broken-links`: it reads only .md/.mdx, so the .jsx
snippets are invisible to it; it extracts href only from <a> and <Card>; it
treats absolute https://infisical.com/docs/... URLs as external; and it accepts
any path that happens to be a directory on disk.
"""

import json
import os
import re
import sys

DOCS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_PREFIX = "https://infisical.com/docs/"
ASSET_DIRS = ("images", "logo", "fonts", "static")
SKIP_DIRS = (".git", "node_modules")

MARKDOWN_LINK = re.compile(r"\]\(\s*([^)\s]+)")
HREF_PROP = re.compile(r"""href\s*=\s*["']([^"']+)["']""")
JSX_PATH = re.compile(r""""(?:path|href|url)"\s*:\s*["']([^"']+)["']""")
ABSOLUTE = re.compile(r"""(https://infisical\.com/docs/[^\s"'`)\]>,]+)""")
INLINE_CODE = re.compile(r"`[^`]*`")
FENCE = re.compile(r"^\s*(```|~~~)")


def normalize(link):
    link = link.split("#")[0].split("?")[0].strip()
    if link.startswith(SITE_PREFIX):
        link = "/" + link[len(SITE_PREFIX) :]
    return link.strip("/")


def is_internal(link):
    if not link or link.startswith(("#", "?", "mailto:", "tel:", "{", "$")):
        return False
    if link.startswith(SITE_PREFIX):
        return True
    if "://" in link or link.startswith("//"):
        return False
    return link.startswith("/")


def load_targets():
    pages, prefixes = set(), []
    for root, dirs, files in os.walk(DOCS):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if name.endswith((".mdx", ".md")):
                rel = os.path.relpath(os.path.join(root, name), DOCS)
                pages.add(os.path.splitext(rel)[0].replace(os.sep, "/"))

    with open(os.path.join(DOCS, "docs.json"), encoding="utf-8") as handle:
        config = json.load(handle)

    def walk(node):
        if isinstance(node, str):
            if not node.startswith("http"):
                pages.add(normalize(node))
        elif isinstance(node, list):
            for item in node:
                walk(item)
        elif isinstance(node, dict):
            for key, value in node.items():
                if key not in ("icon", "tab", "group", "anchor", "tag"):
                    walk(value)

    walk(config.get("navigation"))
    for redirect in config.get("redirects", []):
        source = redirect.get("source", "")
        if ":" in source or "*" in source:
            prefixes.append(normalize(re.split(r"[:*]", source)[0]))
        else:
            pages.add(normalize(source))
    return pages, [p for p in prefixes if p]


def collect(rel, text):
    patterns = (JSX_PATH, ABSOLUTE) if rel.endswith(".jsx") else (MARKDOWN_LINK, HREF_PROP, ABSOLUTE)
    in_fence = False
    found = []
    for lineno, line in enumerate(text.splitlines(), 1):
        if FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        line = INLINE_CODE.sub(lambda m: " " * len(m.group(0)), line)
        for pattern in patterns:
            for match in pattern.finditer(line):
                found.append((lineno, match.group(1)))
    return found


def main():
    pages, prefixes = load_targets()
    findings = set()
    for root, dirs, files in os.walk(DOCS):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in sorted(files):
            if not name.endswith((".mdx", ".jsx")):
                continue
            rel = os.path.relpath(os.path.join(root, name), DOCS).replace(os.sep, "/")
            if rel.startswith(ASSET_DIRS):
                continue
            with open(os.path.join(root, name), encoding="utf-8") as handle:
                text = handle.read()
            for lineno, raw in collect(rel, text):
                if not is_internal(raw):
                    continue
                link = normalize(raw)
                if not link or link.startswith(ASSET_DIRS) or os.path.splitext(link)[1]:
                    continue
                if link in pages or any(link.startswith(p + "/") for p in prefixes):
                    continue
                reason = "bare directory link, not a page" if os.path.isdir(os.path.join(DOCS, link)) else "no page, no nav entry, no redirect"
                findings.add(f"{rel}:{lineno} {raw} -> {reason}")

    for finding in sorted(findings):
        print(finding)
    print(f"{len(findings)} broken link(s)")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
