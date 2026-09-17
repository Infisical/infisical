# Security checks on pull requests

Four automated security checks run against every pull request to `main`. This
page covers what each one looks at, whether it can stop a merge, and what to
do when one fires.

## What runs

| Check | Covers | Configured in |
|---|---|---|
| `Veria AI - PR Review` | Static analysis of the changed code | Veria app |
| `Socket Security: Pull Request Alerts` | Dependencies added or changed by the PR | `socket.yml` plus the Socket dashboard |
| `Socket Security: Project Report` | Dependency inventory for the branch | `socket.yml` plus the Socket dashboard |
| `GitGuardian Security Checks` | Secrets in the diff | GitGuardian app |

Two more scans run outside the pull request flow. Veria scans `main` on a
weekly schedule, which catches code that reached the branch without a per-PR
scan. Snyk scans the published container images on release tag pushes, running
in `monitor` mode after the image exists, so it records findings rather than
gating them.

Locally, the `pre-commit` hook runs `infisical scan git-changes --staged`.
Anyone can skip it with `--no-verify`, so GitGuardian covers the same ground
in CI.

## What blocks a merge

Nothing yet. No security check is currently listed as required in the branch
ruleset, so a red check leaves the merge button available and the decision
with the reviewer.

The gate described below is scoped to what a pull request changes. A
dependency the PR adds, and a version it bumps, are in scope. Everything
already on `main` is grandfathered and reports without blocking.

Socket's pull request alerts already work this way. They fire on manifest
changes, so a dependency the PR leaves alone does not re-alert. `Socket
Security: Project Report` behaves differently: it inventories the whole
branch, which is why it stays advisory and is never made required. Requiring
it would pull the entire existing dependency tree into the gate.

The target state is that `Veria AI - PR Review`, `Socket Security: Pull
Request Alerts`, and `GitGuardian Security Checks` are required, at these
thresholds:

| What the PR does | Finding | Effect |
|---|---|---|
| Adds a dependency, or bumps one | Malware, typosquat, install script, obfuscated code | Blocks |
| Adds a dependency, or bumps one | Known CVE, critical or high | Blocks |
| Adds a dependency, or bumps one | Known CVE, medium or low | Reports |
| Adds a dependency, or bumps one | Protestware (`troll`), git or http dependency source | Reports |
| Adds a dependency, or bumps one | Deprecated, unmaintained, native code, `eval` | Reports |
| Leaves a dependency untouched | Anything | Reports. Grandfathered. |
| Any change | Secret detected in the diff | Blocks. Rotate the credential before the PR moves. |
| Any change | High or critical static-analysis finding in the changed code | Blocks |
| Any change | Static-analysis finding elsewhere in the repo | Reports. Grandfathered. |

A transitive dependency counts as added. Pulling in a package that brings a
vulnerable one with it is the case the gate is built for, and Socket reports it
with the full path from the manifest down to the offending package.

On a version bump, Socket evaluates the new version of the changed package
rather than diffing its alert list against the old one. A critical or high CVE
that both versions carry will therefore block the bump. Medium and low CVEs
report at every severity and block at none, which keeps routine upgrades moving
while the supply-chain alerts above still stop a bad package.

One thing this deliberately does not catch: a new advisory published against a
package already in the tree. No pull request introduced it, so no gate fires.
It will not come from the weekly Veria scan either, which analyzes code rather
than dependencies. It surfaces in Socket, through the dashboard and the branch
inventory that `Socket Security: Project Report` produces on each pull
request, and runs on the remediation clock for its severity from there.

In Socket, blocking is set per alert type in the dashboard security policy,
where `Block` fails the check and `Warn`, `Monitor`, and `Ignore` do not. The
repo's `socket.yml` decides which alerts exist at all; it cannot express the
block-versus-warn split, so the two have to be read together.

Three things have to happen before these thresholds take effect, and all sit
outside this repository. The checks have to be added to the branch ruleset,
which is an organization-level change. The Socket dashboard policy has to set
the blocking alert types to `Block`. And the failing path for each scanner has
to be exercised at least once. A check that has only ever reported green says
nothing about what it does when it goes red.

Veria needs one extra confirmation before it is made required. Its findings on
`main` are repository-wide, and a backlog of them is open. The pull request
check has stayed green throughout, which suggests it reviews the diff, but
that should be confirmed in Veria's own configuration rather than inferred
from a run of green checks.

## When a check fires

1. Read the finding on the scanner that raised it. The check annotation links
through.
2. Decide whether it is real. Scanners over-report, and a dependency alert in
particular depends on how the package is actually used here.
3. If it is real, fix it in the PR. For a secret, rotate the credential first,
then rewrite the history.
4. If it is a false positive, suppress it at the scanner with a reason
recorded. Do not silence a whole alert class in `socket.yml` to clear one
package.
5. If you are unsure, ask in `#security` before merging.

Do not report a vulnerability you find in Infisical itself through a pull
request. [SECURITY.md](../SECURITY.md) has the disclosure route.

## Bypass

A Socket alert that has been reviewed and found to be a false positive can be
cleared on the pull request with `@SocketSecurity ignore <package@version>`,
posted as the first content of a comment in the main thread. The report reruns
without that package, and editing or deleting the comment reverses it. It is
for a finding someone has actually looked at. A pull request carrying one of
these commands is reviewed on that basis before it merges.

Once these checks are required, merging past a red one that cannot be cleared
that way needs a named reason and someone from the security team on the
thread. Three cases qualify: an incident fix that cannot wait, a scanner
outage, and a false positive that cannot be suppressed in time. All three are
logged and reviewed afterward.

The finding stays open after a bypass, and the reason recorded at merge is
what the later review reads.
