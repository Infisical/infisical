# Certificate request failures

How an approved issuance or renewal records and reports a failure. The approvals rule it follows is in the root
`AGENTS.md` (Approvals).

In `cert-request-policy-factory.ts`'s `postApprovalRoutine`, the status writes around the action (`updateById` before it,
`transitionFromPending` in its `catch`) and the renewal telemetry still run outside any guard, so they can still throw, and a throw from the `catch`'s write sends no notice.
Don't copy that part. An external CA can fail an approved certificate request later, in a background job. Jobs report
that through `updateCertificateRequestStatus`, whose two implementations (`certificate-request-service.ts`, and the
manual validation one in `certificate-authority-service.ts`) record it with `recordCertificateRequestFailure` and pass
`notifyApprovers: true`. A new job that fails a certificate request must go through one of them, or nobody who approved
the request hears about it, and must pass `failureStage: CaOperationFailureStage.AttachingIssuedCertificate` when
linking a certificate the CA already issued to its request fails, since the notice otherwise says the CA failed and a
retry issues a duplicate. A failure inside a CA module after the CA issued (storing the certificate) still reports at
the CA stage, because the main issuance queue catch can't tell it apart; that catch reports
`CaOperationFailureStage.Infisical` until the worker's own checks pass and `Ca` from then on, so keep any new check that
runs before the CA call above that switch. The ACME order sync (`checkAndSyncAcmeOrderStatus`) is an exception: it fails
an abandoned ACME issuance directly inside its transaction, and records no failure event and sends no notice.
