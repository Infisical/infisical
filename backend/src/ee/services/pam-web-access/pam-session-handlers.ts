import { PamAccountType } from "@app/ee/services/pam/pam-enums";

import { handleMysqlSession } from "./mysql/pam-mysql-session-handler";
import { TSessionContext, TSessionHandlerResult } from "./pam-web-access-types";
import { handlePostgresSession } from "./postgres/pam-postgres-session-handler";
import { handleRdpSession } from "./rdp/pam-rdp-session-handler";
import { handleSSHSession } from "./ssh/pam-ssh-session-handler";
import { handleWebSession } from "./web/pam-web-session-handler";

export type TWebAccessHandler = (
  ctx: TSessionContext,
  params: { connectionDetails: Record<string, unknown>; credentials: Record<string, unknown> }
) => Promise<TSessionHandlerResult>;

type TSessionHandlerEntry = {
  gatewayAccountType: PamAccountType;
  handler: TWebAccessHandler;
};

export const SESSION_HANDLERS: Partial<Record<PamAccountType, TSessionHandlerEntry>> = {
  [PamAccountType.Postgres]: {
    gatewayAccountType: PamAccountType.Postgres,
    handler: handlePostgresSession
  },
  [PamAccountType.MySQL]: {
    gatewayAccountType: PamAccountType.MySQL,
    handler: handleMysqlSession
  },
  [PamAccountType.SSH]: {
    gatewayAccountType: PamAccountType.SSH,
    handler: handleSSHSession
  },
  [PamAccountType.Windows]: {
    gatewayAccountType: PamAccountType.Windows,
    handler: handleRdpSession
  },
  // Windows AD accounts use RDP through the Windows gateway protocol
  [PamAccountType.WindowsAd]: {
    gatewayAccountType: PamAccountType.Windows,
    handler: handleRdpSession
  },
  [PamAccountType.Web]: {
    gatewayAccountType: PamAccountType.Web,
    handler: handleWebSession
  }
};
