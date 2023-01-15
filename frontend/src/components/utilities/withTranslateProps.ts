import { GetServerSideProps, GetStaticProps } from "next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

const DefaultNamespaces = ["common", "nav"];

type GetTranslatedStaticProps = (
  namespaces: string[],
  getStaticProps?: GetStaticProps<any>
) => GetStaticProps;

type GetTranslatedServerSideProps = (
  namespaces: string[],
  getStaticProps?: GetServerSideProps<any>
) => GetServerSideProps;

export const getTranslatedStaticProps: GetTranslatedStaticProps =
  (namespaces, getStaticProps) =>
  async ({ locale, ...context }) => {
    let staticProps = { props: {} };
    if (typeof getStaticProps === "function") {
      staticProps = (await getStaticProps(context)) as any;
    }
    return {
      ...staticProps,
      props: {
        ...(await serverSideTranslations(locale ?? "en", [
          ...DefaultNamespaces,
          ...namespaces,
        ])),
        ...staticProps.props,
      },
    };
  };

export const getTranslatedServerSideProps: GetTranslatedServerSideProps =
  (namespaces, getServerSideProps) =>
  async ({ locale, ...context }) => {
    let staticProps = { props: {} };
    if (typeof getServerSideProps === "function") {
      staticProps = (await getServerSideProps(context)) as any;
    }
    return {
      ...staticProps,
      props: {
        ...(await serverSideTranslations(locale ?? "en", [
          ...DefaultNamespaces,
          ...namespaces,
        ])),
        ...staticProps.props,
      },
    };
  };
