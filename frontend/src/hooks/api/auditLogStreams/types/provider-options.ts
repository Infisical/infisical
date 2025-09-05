import { LogProvider } from "../enums";

export type TAuditLogStreamProviderOptionBase = {
  name: string;
};

export type TAuditLogStreamProviderOption = {
  [P in keyof typeof LogProvider]: TAuditLogStreamProviderOptionBase & {
    provider: (typeof LogProvider)[P];
  };
}[keyof typeof LogProvider];
