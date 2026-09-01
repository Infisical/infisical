export const SLACK_WEBHOOK_TIMEOUT = 7 * 1000;

export type TSlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string; emoji?: boolean } }
  | { type: "section"; text: { type: "mrkdwn"; text: string } }
  | { type: "section"; fields: Array<{ type: "mrkdwn"; text: string }> }
  | { type: "context"; elements: Array<{ type: "mrkdwn"; text: string }> }
  | { type: "divider" }
  | {
      type: "actions";
      elements: Array<{
        type: "button";
        text: { type: "plain_text"; text: string; emoji?: boolean };
        url: string;
        style?: "primary" | "danger";
      }>;
    };

export type TSlackPayload = {
  text: string;
  blocks: TSlackBlock[];
  attachments?: Array<{ color: string; blocks: TSlackBlock[] }>;
};
