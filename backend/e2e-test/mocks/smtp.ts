import { TSmtpSendMail, TSmtpService } from "@app/services/smtp/smtp-service";

export const mockSmtpServer = (): TSmtpService => {
  const storage: TSmtpSendMail[] = [];
  return {
    sendMail: async (data) => {
      storage.push(data);
    },
    verify: async () => {
      return true;
    }
  };
};
