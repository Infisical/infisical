import { useEffect, useState } from "react";

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

/** The permissions the connection's credentials need on the bucket, narrowed to the configured prefix. */
export const iamPolicyFor = (bucket: string, keyPrefix: string) => {
  const prefix = keyPrefix.replace(/^\/+|\/+$/g, "");
  const objects = `arn:aws:s3:::${bucket || "<bucket>"}/${prefix ? `${prefix}/` : ""}*`;
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

/** Playback reads the objects from S3 directly, so the bucket has to allow this origin. */
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

/** A numbered list of console steps. Local because nothing else in v3 renders one. */
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
  /**
   * The result of the CORS check the save just ran, or null when this was opened for reference.
   * The dialog never probes on its own: a check that runs on every open stalls the dialog and
   * reports a problem nobody was asking about.
   */
  isCorsMissing?: boolean;
};

export const AwsSetupDialog = ({
  isOpen,
  onOpenChange,
  bucket,
  keyPrefix,
  isCorsMissing = false
}: Props) => {
  const [tab, setTab] = useState<TabValue>("policy");

  // The component stays mounted while closed, so the opening tab is chosen here rather than by a
  // default value: a reopen would otherwise keep whichever tab was left behind last time.
  useEffect(() => {
    if (isOpen) setTab(isCorsMissing ? "cors" : "policy");
  }, [isOpen, isCorsMissing]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>AWS Setup</DialogTitle>
          <DialogDescription>
            Two things to set up in AWS so Infisical can write records, and so your browser can read
            them back.
          </DialogDescription>
        </DialogHeader>

        {/* space-y, not flex: as flex items the code blocks shrink to fit instead of overflowing, and
          CodeBlock clips its own content, so the panel silently truncates rather than scrolling. */}
        <DialogBody className="space-y-4">
          <Tabs value={tab} onValueChange={(next) => setTab(next as TabValue)}>
            <TabsList variant="av">
              {/* Not "bucket policy": this one carries no Principal, so it is an identity policy and
                S3's bucket policy editor rejects it. Naming the wrong surface sent people to the
                wrong console page and an error that does not explain itself. */}
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
          {/* Two numbered steps, so step one advances rather than offering to close halfway. */}
          {tab === "policy" ? (
            <Button variant="av" type="button" onClick={() => setTab("cors")}>
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
