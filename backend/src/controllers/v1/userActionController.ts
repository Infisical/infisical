import { Request, Response } from "express";
import { validateRequest } from "../../helpers/validation";
import { UserAction } from "../../models";
import * as reqValidator from "../../validation/action";

/**
 * Add user action [action]
 * @param req
 * @param res
 * @returns
 */
export const addUserAction = async (req: Request, res: Response) => {
  // add/record new action [action] for user with id [req.user._id]
  const {
    body: { action }
  } = await validateRequest(reqValidator.AddUserActionV1, req);

  const userAction = await UserAction.findOneAndUpdate(
    {
      user: req.user._id,
      action
    },
    { user: req.user._id, action },
    {
      new: true,
      upsert: true
    }
  );

  return res.status(200).send({
    message: "Successfully recorded user action",
    userAction
  });
};

/**
 * Return user action [action] for user
 * @param req
 * @param res
 * @returns
 */
export const getUserAction = async (req: Request, res: Response) => {
  // get user action [action] for user with id [req.user._id]
  const {
    query: { action }
  } = await validateRequest(reqValidator.GetUserActionV1, req);

  const userAction = await UserAction.findOne({
    user: req.user._id,
    action
  });

  return res.status(200).send({
    userAction
  });
};
