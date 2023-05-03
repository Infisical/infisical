import { Request, Response } from 'express';

export const handleAuthProviderCallback = (req: Request, res: Response) => {
    res.redirect(`/login/provider/success?token=${encodeURIComponent(req.providerAuthToken)}`);
}
