export type TPkiAlert = {
  id: string;
  name: string;
  projectId: string;
  pkiCollectionId: string;
  alertBeforeDays: number;
  recipientEmails: string;
  createdAt: string;
  updatedAt: string;
};

export type TCreatePkiAlertDTO = {
  name: string;
  pkiCollectionId: string;
  alertBeforeDays: number;
  emails: string[];
};

export type TUpdatePkiAlertDTO = {
  alertId: string;
  pkiCollectionId?: string;
  name?: string;
  alertBeforeDays?: number;
  emails?: string[];
};

export type TDeletePkiAlertDTO = {
  alertId: string;
};
