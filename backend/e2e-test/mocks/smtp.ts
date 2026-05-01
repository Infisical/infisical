import { TSmtpSendMail, TSmtpService } from "@app/services/smtp/smtp-service";

export type TTestSmtpService = TSmtpService & {
  getEmails: () => TSmtpSendMail[];
  getLastEmail: () => TSmtpSendMail | undefined;
  clear: () => void;
};

export const mockSmtpServer = (): TTestSmtpService => {
  const storage: TSmtpSendMail[] = [];
  return {
    sendMail: async (data) => {
      storage.push(data);
    },
    verify: async () => {
      return true;
    },
    getEmails: () => storage,
    getLastEmail: () => storage[storage.length - 1],
    clear: () => {
      storage.length = 0;
    }
  };
};
