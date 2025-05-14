import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";

import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { TCertificateAuthority } from "../certificate-authority-types";
import { TExternalCertificateAuthorityDALFactory } from "../external-certificate-authority-dal";
import { AcmeDnsProvider } from "./acme-certificate-authority-enums";
import {
  TCreateAcmeCertificateAuthorityDTO,
  TUpdateAcmeCertificateAuthorityDTO
} from "./acme-certificate-authority-types";

type TAcmeCertificateAuthorityFnsDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "create" | "transaction" | "findByIdWithAssociatedCa" | "updateById"
  >;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "create" | "update">;
};

export const AcmeCertificateAuthorityFns = ({
  appConnectionDAL,
  appConnectionService,
  certificateAuthorityDAL,
  externalCertificateAuthorityDAL
}: TAcmeCertificateAuthorityFnsDeps) => {
  const createCertificateAuthority = async ({
    name,
    projectId,
    configuration,
    disableDirectIssuance,
    actor,
    status
  }: {
    status: CaStatus;
    name: string;
    projectId: string;
    configuration: TCreateAcmeCertificateAuthorityDTO["configuration"];
    disableDirectIssuance: boolean;
    actor: OrgServiceActor;
  }) => {
    const { dnsAppConnectionId, directoryUrl, accountEmail, dnsProvider } = configuration;
    const appConnection = await appConnectionDAL.findById(dnsAppConnectionId);

    if (!appConnection) {
      throw new NotFoundError({ message: `App connection with ID '${dnsAppConnectionId}' not found` });
    }

    if (dnsProvider === AcmeDnsProvider.Route53 && appConnection.app !== AppConnection.AWS) {
      throw new BadRequestError({
        message: `App connection with ID '${dnsAppConnectionId}' is not an AWS connection`
      });
    }

    // validates permission to connect
    await appConnectionService.connectAppConnectionById(appConnection.app as AppConnection, dnsAppConnectionId, actor);

    const caEntity = await certificateAuthorityDAL.transaction(async (tx) => {
      const ca = await certificateAuthorityDAL.create(
        {
          projectId,
          disableDirectIssuance
        },
        tx
      );

      await externalCertificateAuthorityDAL.create(
        {
          certificateAuthorityId: ca.id,
          dnsAppConnectionId,
          type: CaType.ACME,
          name,
          configuration: {
            directoryUrl,
            accountEmail,
            dnsProvider
          },
          status
        },
        tx
      );

      return certificateAuthorityDAL.findByIdWithAssociatedCa(ca.id, tx);
    });

    if (!caEntity.externalCa) {
      throw new BadRequestError({ message: "Failed to create external certificate authority" });
    }

    return {
      id: caEntity.id,
      type: CaType.ACME,
      disableDirectIssuance: caEntity.disableDirectIssuance,
      name: caEntity.externalCa.name,
      projectId,
      status,
      configuration: caEntity.externalCa.configuration
    } as TCertificateAuthority;
  };

  const updateCertificateAuthority = async ({
    id,
    status,
    configuration,
    disableDirectIssuance,
    actor
  }: {
    id: string;
    status?: CaStatus;
    configuration: TUpdateAcmeCertificateAuthorityDTO["configuration"];
    disableDirectIssuance?: boolean;
    actor: OrgServiceActor;
  }) => {
    const updatedCa = await certificateAuthorityDAL.transaction(async (tx) => {
      if (configuration) {
        const { dnsAppConnectionId, directoryUrl, accountEmail, dnsProvider } = configuration;
        const appConnection = await appConnectionDAL.findById(dnsAppConnectionId);

        if (!appConnection) {
          throw new NotFoundError({ message: `App connection with ID '${dnsAppConnectionId}' not found` });
        }

        if (dnsProvider === AcmeDnsProvider.Route53 && appConnection.app !== AppConnection.AWS) {
          throw new BadRequestError({
            message: `App connection with ID '${dnsAppConnectionId}' is not an AWS connection`
          });
        }

        // validates permission to connect
        await appConnectionService.connectAppConnectionById(
          appConnection.app as AppConnection,
          dnsAppConnectionId,
          actor
        );

        await externalCertificateAuthorityDAL.update(
          {
            certificateAuthorityId: id,
            type: CaType.ACME
          },
          {
            configuration: { directoryUrl, accountEmail, dnsProvider, dnsAppConnectionId }
          },
          tx
        );
      }

      if (status) {
        await externalCertificateAuthorityDAL.update(
          {
            certificateAuthorityId: id,
            type: CaType.ACME
          },
          {
            status
          },
          tx
        );
      }

      if (disableDirectIssuance !== undefined) {
        await certificateAuthorityDAL.updateById(
          id,
          {
            disableDirectIssuance
          },
          tx
        );
      }

      return certificateAuthorityDAL.findByIdWithAssociatedCa(id, tx);
    });

    if (!updatedCa.externalCa) {
      throw new BadRequestError({ message: "Failed to update external certificate authority" });
    }

    return {
      id: updatedCa.id,
      type: CaType.ACME,
      disableDirectIssuance: updatedCa.disableDirectIssuance,
      name: updatedCa.externalCa.name,
      projectId: updatedCa.projectId,
      status: updatedCa.externalCa.status,
      configuration: updatedCa.externalCa.configuration
    };
  };

  return {
    createCertificateAuthority,
    updateCertificateAuthority
  };
};
