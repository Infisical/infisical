import express, { Request, Response } from "express";
import { getInviteOnlySignup, getRedisUrl, getSecretScanningGitAppId, getSecretScanningPrivateKey, getSecretScanningWebhookSecret, getSmtpConfigured } from "../../config";

const router = express.Router();

router.get(
  "/status",
  async (req: Request, res: Response) => {
    const gitAppId = await getSecretScanningGitAppId()
    const gitSecretScanningWebhookSecret = await getSecretScanningWebhookSecret()
    const gitSecretScanningPrivateKey = await getSecretScanningPrivateKey()
    let secretScanningConfigured = false
    if (gitAppId && gitSecretScanningPrivateKey && gitSecretScanningWebhookSecret) {
      secretScanningConfigured = true
    }

    res.status(200).json({
      date: new Date(),
      message: "Ok",
      emailConfigured: await getSmtpConfigured(),
      inviteOnlySignup: await getInviteOnlySignup(),
      redisConfigured: await getRedisUrl() !== "" && await getRedisUrl() !== undefined,
      secretScanningConfigured: secretScanningConfigured,
    })
  }
);

export default router