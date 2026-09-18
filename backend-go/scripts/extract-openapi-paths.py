#!/usr/bin/env python3
"""Extract selected paths from a served OpenAPI JSON document."""

import argparse
import json
import re
from pathlib import Path
from typing import Any

import yaml


KMS_PATH = re.compile(r"/kms(?:/|$)", re.IGNORECASE)
COMPONENT_REF = re.compile(r"^#/components/([^/]+)/(.+)$")


def refs(value: Any) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    if isinstance(value, dict):
        ref = value.get("$ref")
        if isinstance(ref, str):
            match = COMPONENT_REF.match(ref)
            if match:
                found.append((match.group(1), match.group(2)))
        for child in value.values():
            found.extend(refs(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(refs(child))
    return found


def referenced_components(spec: dict[str, Any], paths: dict[str, Any]) -> dict[str, dict[str, Any]]:
    components = spec.get("components", {})
    needed = set(refs(paths))

    # Security requirements refer to securitySchemes by name rather than $ref.
    for operation in paths.values():
        for requirement in refs(operation):
            needed.add(requirement)
        if isinstance(operation, dict):
            for requirement in operation.get("security", []):
                if isinstance(requirement, dict):
                    needed.update(("securitySchemes", name) for name in requirement)

    result: dict[str, dict[str, Any]] = {}
    while needed:
        section, name = needed.pop()
        source = components.get(section, {})
        if name in result.get(section, {}):
            continue
        if not isinstance(source, dict) or name not in source:
            continue
        result.setdefault(section, {})[name] = source[name]
        needed.update(refs(source[name]))

    return result


def extract(spec: dict[str, Any], prefix: str) -> dict[str, Any]:
    prefix = f"/{prefix.strip('/')}" if prefix.strip('/') else ""
    def output_path(path: str) -> str:
        # The served Node spec prefixes API routes with /api; the Go server owns
        # the replacement /api-go namespace rather than nesting it under /api.
        if prefix and path.startswith("/api/"):
            return f"{prefix}{path[len('/api'):]}"
        return f"{prefix}{path}"

    paths = {
        output_path(path): value
        for path, value in spec.get("paths", {}).items()
        if KMS_PATH.search(path)
    }
    output: dict[str, Any] = {
        "openapi": spec.get("openapi", "3.0.0"),
        "info": spec.get("info", {}),
        "servers": spec.get("servers", []),
        "paths": paths,
    }
    components = referenced_components(spec, paths)
    if components:
        output["components"] = components
    for key in ("externalDocs", "tags"):
        if key in spec:
            output[key] = spec[key]
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Served OpenAPI JSON file")
    parser.add_argument("output", type=Path, help="Filtered OpenAPI YAML file")
    parser.add_argument("--prefix", default="/api-go", help="Prefix to prepend to each selected path")
    args = parser.parse_args()

    with args.input.open(encoding="utf-8") as source:
        spec = json.load(source)
    if not isinstance(spec, dict) or not isinstance(spec.get("paths"), dict):
        raise SystemExit("input is not an OpenAPI document with a paths object")

    result = extract(spec, args.prefix)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as target:
        yaml.safe_dump(result, target, sort_keys=False, allow_unicode=True)
    print(f"wrote {len(result['paths'])} paths to {args.output}")


if __name__ == "__main__":
    main()
