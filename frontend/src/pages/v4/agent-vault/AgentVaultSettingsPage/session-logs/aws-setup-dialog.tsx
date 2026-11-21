import { useEffect, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Code } from "@infisical/cipher/ui/code";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Stack } from "@infisical/cipher/ui/layout";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { SmallText } from "@infisical/cipher/ui/text";

import { useProjectScope } from "../../../access/project/scope";
import { useV4Adapter } from "../../../data/adapters";

const iamPolicyFor = (bucket: string, keyPrefix: string) => {
  const folder = keyPrefix ? `${keyPrefix}/` : "";
  return JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["s3:PutObject", "s3:GetObject"],
          Resource: `arn:aws:s3:::${bucket || "<bucket>"}/${folder}*`
        },
        {
          Effect: "Allow",
          Action: ["s3:ListBucket"],
          Resource: `arn:aws:s3:::${bucket || "<bucket>"}`,
          ...(folder && { Condition: { StringLike: { "s3:prefix": [`${folder}*`] } } })
        }
      ]
    },
    null,
    2
  );
};

const corsPolicyFor = (origin: string) =>
  JSON.stringify(
    [
      {
        AllowedHeaders: ["*"],
        AllowedMethods: ["GET"],
        AllowedOrigins: [origin],
        MaxAgeSeconds: 3000
      }
    ],
    null,
    2
  );

const Steps = ({ items }: { items: string[] }) => (
  <Stack gap={4}>
    {items.map((item, index) => (
      <SmallText key={item} muted>
        {index + 1}. {item}
      </SmallText>
    ))}
  </Stack>
);

export const HostBlockedMessage = ({ host }: { host: string }) => (
  <>
    Your browser can&apos;t reach <Code>{host}</Code>, because this Infisical instance doesn&apos;t
    allow it. Ask whoever runs Infisical to allow that host.
  </>
);

type TabValue = "policy" | "cors";

export const AwsSetupDialog = ({
  open,
  onOpenChange,
  bucket,
  keyPrefix,
  unsaved = false
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucket: string | null;
  keyPrefix: string | null;
  unsaved?: boolean;
}) => {
  const { orgId, projectId } = useProjectScope();
  const settings = useV4Adapter("agentVaultSettings");
  const { data: savedReadCheck } = settings.useSessionLogReadCheck(
    orgId,
    projectId,
    open && !unsaved
  );
  const { recheck } = settings.useSessionLogReadCheckActions(orgId, projectId);
  // The check reads the saved bucket, so it says nothing about a bucket that is only typed in.
  const readCheck = unsaved ? null : savedReadCheck;
  const readAccess = readCheck?.status;
  const isCorsMissing = readAccess === "cors-missing";
  // Any answer S3 let the browser read proves the CORS rule is already attached.
  const hasCorsRule = readAccess === "access-denied" || readAccess === "readable";
  const [tab, setTab] = useState<TabValue>("policy");
  const [hasPickedTab, setHasPickedTab] = useState(false);

  const pickTab = (next: TabValue) => {
    setHasPickedTab(true);
    setTab(next);
  };

  const handleOpenChange = (next: boolean) => {
    // Re-checked on close, so the page's warning clears once the rule or policy is attached.
    if (!next) recheck();
    onOpenChange(next);
  };

  useEffect(() => {
    if (!open) return;
    setTab(isCorsMissing ? "cors" : "policy");
    setHasPickedTab(false);
  }, [open]);

  useEffect(() => {
    if (isCorsMissing && !hasPickedTab) setTab("cors");
  }, [isCorsMissing, hasPickedTab]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AWS setup</DialogTitle>
          <DialogDescription>
            {unsaved
              ? "Saving with session logs on checks that Infisical can write to the bucket, so attach the IAM policy first. The CORS rule lets your browser read records back."
              : "Infisical needs the IAM policy to write records, and your browser needs the CORS rule to read them back."}
          </DialogDescription>
        </DialogHeader>
        <Stack gap={16}>
          {readCheck?.status === "host-blocked" && (
            <Alert tone="warn" title="This host is blocked">
              <HostBlockedMessage host={readCheck.host} />
            </Alert>
          )}
          <Tabs
            label="AWS setup steps"
            value={tab}
            onChange={(next) => pickTab(next as TabValue)}
            tabs={[
              {
                value: "policy",
                label: "1. IAM policy",
                content: (
                  <Stack gap={16}>
                    {readAccess === "access-denied" && (
                      <Alert
                        tone="warn"
                        title="This connection is not allowed to read from this bucket"
                      >
                        Nobody can read session logs back until this policy is attached, and new
                        logs may not be stored.
                      </Alert>
                    )}
                    <Steps
                      items={[
                        "In AWS, open IAM, then Policies, then Create policy.",
                        "Select the JSON tab and paste the policy below.",
                        "Attach it to the IAM user or role this connection authenticates as."
                      ]}
                    />
                    <CodeBlock
                      label="IAM policy"
                      language="json"
                      copyLabel="Copy IAM policy"
                      code={iamPolicyFor(bucket ?? "", keyPrefix ?? "")}
                    />
                  </Stack>
                )
              },
              {
                value: "cors",
                label: "2. CORS rule",
                content: (
                  <Stack gap={16}>
                    {isCorsMissing && (
                      <Alert
                        tone="warn"
                        title="This bucket is not allowing requests from this origin"
                      >
                        Session logs are still stored, but nobody can read them back until this rule
                        is attached.
                      </Alert>
                    )}
                    <Steps
                      items={[
                        `In AWS, open S3 and select the ${bucket ? `${bucket} bucket` : "bucket"}.`,
                        "Open the Permissions tab and find Cross-origin resource sharing (CORS).",
                        "Select Edit, paste the rule below, and save."
                      ]}
                    />
                    <CodeBlock
                      label="CORS rule"
                      language="json"
                      copyLabel="Copy CORS rule"
                      code={corsPolicyFor(window.location.origin)}
                    />
                  </Stack>
                )
              }
            ]}
          />
        </Stack>
        <DialogFooter>
          {tab === "policy" && !hasCorsRule ? (
            <Button type="button" onClick={() => pickTab("cors")}>
              Next
            </Button>
          ) : (
            <Button type="button" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
