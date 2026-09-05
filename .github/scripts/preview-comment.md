# Northflank preview comment

`preview-comment.yml` maintains one `github-actions[bot]` comment per PR using
Northflank's existing GitHub commit statuses and deployment statuses. It needs
no Northflank API token or additional webhook service.

The workflow reads the current PR head and latest API state on every event.
Writes are serialized per PR, and a same-commit rebuild cannot reuse an older
deployment's success. Only the `northflank-cloud-build-run[bot]` build context
`northflank/infisical/infisical-preview/infisical-core` and deployments named
`pr-<number>-infisical-core` are used. The workflow executes the script from
the default branch, never the deployed PR's checkout.

## Activation

1. Merge the workflow and script into `main`.
2. Run **Update preview comment** manually for a preview PR, or trigger a build.
   Verify the marked comment updates through building, deploying, and ready.
3. In Northflank, open **Infisical Preview → Previews → infisical-preview → Visual**.
   Open the final **Message** node, enable **Skip node execution**, save the node,
   and save the blueprint. This stops the old duplicate comments after the new
   workflow is verified. Existing historical comments are left intact.

The colored dot changes when GitHub delivers status events and the Actions job
runs; it is not an animated or percentage-based progress indicator. GitHub does
not deliver an Actions `deployment_status` run for `inactive`, so an inactive
state is refreshed only on another event or a manual run. The comment is updated
in place rather than automatically pinned in GitHub's interface.

## Verification

Run `node --test .github/scripts/preview-comment.test.cjs`.
`reconcile({ github, context, pr, dryRun: true })` returns the rendered Markdown
without writing a comment, for checking live API data before activation.

To roll back, disable **Update preview comment** in GitHub Actions and uncheck
**Skip node execution** on the Northflank Message node.
