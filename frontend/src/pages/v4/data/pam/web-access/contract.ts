import type { PamAccountType, useAccessPamAccount } from "@app/hooks/api/pam";

import type { MutationOf } from "../../access/contract";

export type TWebAccessTicketInput = {
  accountId: string;
  reason?: string;
  mfaSessionId?: string;
  selectedHost?: string;
};

export type TWebAccessChannel = {
  send: (message: string) => void;
  close: () => void;
  isOpen: () => boolean;
};

export type TWebAccessRemoteDesktop = {
  ended: Promise<void>;
  shutdown: () => void;
};

export type TWebAccessTransport = {
  requestTicket: (input: TWebAccessTicketInput) => Promise<string>;
  openTerminal: (input: {
    accountId: string;
    accountType: PamAccountType;
    ticket: string;
    onMessage: (data: string) => void;
    onClose: () => void;
  }) => TWebAccessChannel;
  openDataExplorer: (input: {
    accountId: string;
    ticket: string;
    onMessage: (data: string) => void;
    onClose: () => void;
  }) => TWebAccessChannel;
  connectRemoteDesktop: (input: {
    container: HTMLElement;
    accountId: string;
    ticket: string;
    destination: string;
    signal: AbortSignal;
  }) => Promise<TWebAccessRemoteDesktop>;
};

export type PamWebAccessAdapter = {
  useWebAccess: () => TWebAccessTransport;
  useAccessAccount: MutationOf<typeof useAccessPamAccount>;
};
