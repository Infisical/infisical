import { Request, Response } from "express";
import { EELicenseService } from "../../services";
import { getLicenseServerUrl } from "../../../config";
import { licenseServerKeyRequest } from "../../../config/request";
import { validateRequest } from "../../../helpers/validation";
import * as reqValidator from "../../../validation/cloudProducts";

/**
 * Return available cloud product information.
 * Note: Nicely formatted to easily construct a table from
 * @param req
 * @param res
 * @returns
 */
export const getCloudProducts = async (req: Request, res: Response) => {
  const {
    query: { "billing-cycle": billingCycle }
  } = await validateRequest(reqValidator.GetCloudProductsV1, req);

  if (EELicenseService.instanceType === "cloud") {
    const { data } = await licenseServerKeyRequest.get(
      `${await getLicenseServerUrl()}/api/license-server/v1/cloud-products?billing-cycle=${billingCycle}`
    );

    return res.status(200).send(data);
  }

  return res.status(200).send({
    head: [],
    rows: []
  });
};
