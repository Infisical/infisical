import nodemailer from "nodemailer";

export interface TicketResolutionEmailData {
  ticketId: string;
  orderId: string;
  customerName: string;
  customerEmail: string;
  issueDescription: string;
  resolution: {
    summary: string;
    totalRefundIssued?: number;
    reshipmentCreated?: boolean;
    trackingNumber?: string;
    actionsPerformed: string[];
  };
}

const SMTP_HOST = process.env.SMTP_HOST || "localhost";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "1025", 10);
const SMTP_FROM = process.env.SMTP_FROM || "support@agentgate-demo.com";

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
  ignoreTLS: true,
});

function formatActionsPerformed(actions: string[]): string {
  if (actions.length === 0) return "<li>No actions recorded</li>";
  return actions.map((a) => `<li>${a}</li>`).join("\n");
}

export async function sendTicketResolutionEmail(
  data: TicketResolutionEmailData
): Promise<void> {
  const { ticketId, orderId, customerName, customerEmail, issueDescription, resolution } = data;

  const refundSection = resolution.totalRefundIssued
    ? `<tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Refund Issued</strong></td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #059669;">$${resolution.totalRefundIssued.toFixed(2)}</td>
      </tr>`
    : "";

  const reshipmentSection = resolution.reshipmentCreated
    ? `<tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Reshipment</strong></td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
          Created<br/>
          <span style="color: #6b7280; font-size: 12px;">Tracking: ${resolution.trackingNumber || "Pending"}</span>
        </td>
      </tr>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket Resolution - ${ticketId}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #e5e7eb;">
              <div style="display: inline-block; padding: 8px 16px; background-color: #10b981; color: white; border-radius: 20px; font-size: 14px; font-weight: 600; margin-bottom: 16px;">
                ✓ TICKET RESOLVED
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #111827;">
                Support Ticket Resolution
              </h1>
              <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">
                Ticket ${ticketId} has been resolved by AgentGate
              </p>
            </td>
          </tr>

          <!-- Customer Info -->
          <tr>
            <td style="padding: 24px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">
                Customer Information
              </h2>
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 8px;">
                <tr>
                  <td style="padding: 12px 16px; width: 40%;"><strong>Name</strong></td>
                  <td style="padding: 12px 16px;">${customerName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-top: 1px solid #e5e7eb;"><strong>Email</strong></td>
                  <td style="padding: 12px 16px; border-top: 1px solid #e5e7eb;">${customerEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-top: 1px solid #e5e7eb;"><strong>Order ID</strong></td>
                  <td style="padding: 12px 16px; border-top: 1px solid #e5e7eb;">${orderId}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Original Issue -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <h2 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">
                Original Issue
              </h2>
              <div style="padding: 16px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  ${issueDescription}
                </p>
              </div>
            </td>
          </tr>

          <!-- Resolution Summary -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <h2 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">
                Resolution Summary
              </h2>
              <div style="padding: 16px; background-color: #ecfdf5; border-radius: 8px; border-left: 4px solid #10b981;">
                <p style="margin: 0; color: #065f46; font-size: 14px;">
                  ${resolution.summary}
                </p>
              </div>
            </td>
          </tr>

          <!-- Resolution Details -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <h2 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">
                Resolution Details
              </h2>
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 8px;">
                ${refundSection}
                ${reshipmentSection}
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Ticket ID</strong></td>
                  <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${ticketId}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Actions Taken -->
          <tr>
            <td style="padding: 0 32px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">
                Actions Taken by Agents
              </h2>
              <div style="padding: 16px; background-color: #f9fafb; border-radius: 8px;">
                <ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 13px; line-height: 1.8;">
                  ${formatActionsPerformed(resolution.actionsPerformed)}
                </ul>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                This is an automated notification from <strong>AgentGate Demo</strong><br/>
                Powered by Infisical Agent Governance
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const info = await transporter.sendMail({
    from: `"AgentGate Support" <${SMTP_FROM}>`,
    to: customerEmail,
    subject: `[Resolved] Ticket ${ticketId} - ${orderId}`,
    html,
  });

  console.log(`[Email] Sent resolution email for ticket ${ticketId} to ${customerEmail} (messageId: ${info.messageId})`);
}

export async function verifySmtpConnection(): Promise<boolean> {
  try {
    await transporter.verify();
    console.log("[Email] SMTP connection verified successfully");
    return true;
  } catch (error) {
    console.error("[Email] SMTP connection failed:", error);
    return false;
  }
}
