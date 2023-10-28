import _ from "lodash";
import { Request, Response } from "express";
import { Types } from "mongoose";
import { Reminder } from "../../models";
import { validateRequest } from "../../helpers/validation";
import * as reqValidatorReminder from "../../validation/reminder";

export const getSecretReminders = async (req: Request, res: Response) => {
  const { params: { secretID } } = await validateRequest(reqValidatorReminder.GetSecretReminder, req);

  const reminders = await Reminder.find({ secret: new Types.ObjectId(secretID) });
  return res.json ({ secretReminders: reminders });
}

export const createSecretReminders = async (req: Request, res: Response) => {
  const {
    params: { secretID },
    body: { frequency, note }
  } = await validateRequest(reqValidatorReminder.CreateSecretReminder, req);

  const reminder = await new Reminder({
    frequency,
    note,
    secret: new Types.ObjectId(secretID),
  }).save();

  return res.json(reminder);
}

export const updateSecretReminders = async (req: Request, res: Response) => {
  const {
    params: { reminderID },
    body: { frequency, note }
  } = await validateRequest(reqValidatorReminder.UpdateSecretReminder, req);

  const updated = await Reminder.updateOne({ _id: reminderID }, { $set: { frequency, note } });
  return res.json(updated);
}

export const deleteSecretReminders = async (req: Request, res: Response) => {
  const {
    params: { reminderID }
  } = await validateRequest(reqValidatorReminder.DeleteSecretReminder, req);

  const deleted = await Reminder.deleteOne({
    _id: new Types.ObjectId(reminderID),
  });
  return res.json(deleted);
}