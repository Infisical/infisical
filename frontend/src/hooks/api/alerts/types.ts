export type TAlert = {
  id: string;
  name: string;
  projectId: string;
  alertBeforeDays: number;
  recipientEmails: string;
  createdAt: string;
  updatedAt: string;
};

export type TCreateAlertDTO = {
  projectId: string;
  name: string;
  alertBeforeDays: number;
  emails: string[];
};

export type TUpdateAlertDTO = {
  alertId: string;
  projectId: string;
  name?: string;
  alertBeforeDays?: number;
  emails?: string[];
};

export type TDeleteAlertDTO = {
  alertId: string;
  projectId: string;
};
