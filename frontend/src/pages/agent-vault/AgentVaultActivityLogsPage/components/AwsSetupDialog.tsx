import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  Alert,
  AlertDescription,
  Button,
  CodeBlock,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  agentVaultKeys,
  useGetAgentVaultActivityLoggingCorsProbe
} from "@app/hooks/api/agentVault";

export const iamPolicyFor = (bucket: string, keyPrefix: string) => {
  const objects = `arn:aws:s3:::${bucket || "<bucket>"}/${keyPrefix ? `${keyPrefix}/` : ""}*`;
  return JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["s3:PutObject", "s3:GetObject"],
          Resource: objects
        },
        {
          Effect: "Allow",
          Action: ["s3:ListBucket"],
          Resource: `arn:aws:s3:::${bucket || "<bucket>"}`
        }
      ]
    },
    null,
    2
  );
};

export const corsPolicyFor = (origin: string) =>
  JSON.stringify(
    [
      {
        AllowedHeaders: ["*"],
        AllowedMethods: ["GET", "PUT"],
        AllowedOrigins: [origin],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3000
      }
    ],
    null,
    2
  );

const Steps = ({ items }: { items: string[] }) => (
  <ol className="flex flex-col gap-1.5 text-xs text-muted">
    {items.map((item, index) => (
      <li key={item} className="flex gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-container text-[10px] font-medium text-foreground">
          {index + 1}
        </span>
        {item}
      </li>
    ))}
  </ol>
);

type TabValue = "policy" | "cors";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  bucket: string | null;
  keyPrefix: string | null;
};

export const AwsSetupDialog = ({ isOpen, onOpenChange, bucket, keyPrefix }: Props) => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  const probe = useGetAgentVaultActivityLoggingCorsProbe(isOpen);
  // The dialog stays mounted while closed, so a link from an earlier open must not be probed again.
  const corsProbeUrl = isOpen && !probe.isFetching ? (probe.data?.url ?? null) : null;
  const [tab, setTab] = useState<TabValue>("policy");
  const [hasPickedTab, setHasPickedTab] = useState(false);
  const [isCorsMissing, setIsCorsMissing] = useState(false);

  const pickTab = (next: TabValue) => {
    setHasPickedTab(true);
    setTab(next);
  };

  useEffect(() => {
    if (!isOpen) {
      queryClient.removeQueries({
        queryKey: agentVaultKeys.activityLoggingCorsProbe(currentOrg.id)
      });
      return;
    }
    setTab("policy");
    setHasPickedTab(false);
  }, [isOpen]);

  useEffect(() => {
    setIsCorsMissing(false);
    if (!isOpen || !corsProbeUrl) return undefined;

    let isCurrent = true;
    // S3 adds CORS headers even to this probe's 404; fetch rejects only when the rule is missing.
    fetch(corsProbeUrl, { mode: "cors", credentials: "omit" }).catch(() => {
      if (isCurrent) setIsCorsMissing(true);
    });
    return () => {
      isCurrent = false;
    };
  }, [isOpen, corsProbeUrl]);

  useEffect(() => {
    if (isCorsMissing && !hasPickedTab) setTab("cors");
  }, [isCorsMissing, hasPickedTab]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>AWS Setup</DialogTitle>
          <DialogDescription>
            Two things to set up in AWS so Infisical can write records, and so your browser can read
            them back.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <Tabs value={tab} onValueChange={(next) => pickTab(next as TabValue)}>
            <TabsList variant="av">
              <TabsTrigger value="policy">1. IAM Policy</TabsTrigger>
              <TabsTrigger value="cors">2. CORS Rule</TabsTrigger>
            </TabsList>

            <TabsContent value="policy" className="space-y-4">
              <Steps
                items={[
                  "In AWS, open IAM, then Policies, then Create policy.",
                  "Select the JSON tab and paste the policy below.",
                  "Attach it to the IAM user or role this connection authenticates as."
                ]}
              />
              <CodeBlock
                label="Lets the connection's credentials write and read objects"
                value={iamPolicyFor(bucket ?? "", keyPrefix ?? "")}
              />
            </TabsContent>

            <TabsContent value="cors" className="space-y-4">
              {isCorsMissing && (
                <Alert variant="warning">
                  <AlertDescription>
                    This bucket is not allowing requests from this origin. Activity is still stored,
                    but nobody can read it back until this rule is attached.
                  </AlertDescription>
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
                label="Lets your browser read the records back"
                value={corsPolicyFor(window.location.origin)}
              />
            </TabsContent>
          </Tabs>
        </DialogBody>

        <DialogFooter>
          {tab === "policy" ? (
            <Button variant="av" type="button" onClick={() => pickTab("cors")}>
              Next
            </Button>
          ) : (
            <Button variant="av" type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
