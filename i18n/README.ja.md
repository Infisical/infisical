<h1 align="center">
  <img width="300" src="/img/logoname-black.svg#gh-light-mode-only" alt="infisical">
  <img width="300" src="/img/logoname-white.svg#gh-dark-mode-only" alt="infisical">
</h1>
<p align="center">
  <p align="center">オープンソースのエンドツーエンド暗号化ツールで、チーム、デバイス、インフラストラクチャ全体の秘密と設定を管理します。</p>
</p>

<h4 align="center">
  <a href="https://join.slack.com/t/infisical-users/shared_invite/zt-1kdbk07ro-RtoyEt_9E~fyzGo_xQYP6g">Slack</a> |
  <a href="https://infisical.com/">Infisical Cloud</a> |
  <a href="https://infisical.com/docs/self-hosting/overview">セルフホスティング</a> |
  <a href="https://infisical.com/docs/getting-started/introduction">ドキュメント</a> |
  <a href="https://www.infisical.com">Web サイト</a>
</h4>

<h4 align="center">
  <a href="https://github.com/medusajs/medusa/blob/master/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="Infisical is released under the MIT license." />
  </a>
  <a href="https://github.com/infisical/infisical/blob/main/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen" alt="PRs welcome!" />
  </a>
  <a href="https://github.com/Infisical/infisical/issues">
    <img src="https://img.shields.io/github/commit-activity/m/infisical/infisical" alt="git commit activity" />
  </a>
  <a href="https://cloudsmith.io/~infisical/repos/">
    <img src="https://img.shields.io/badge/Downloads-34.6k-orange" alt="Cloudsmith downloads" />
  </a>
  <a href="https://join.slack.com/t/infisical-users/shared_invite/zt-1kdbk07ro-RtoyEt_9E~fyzGo_xQYP6g">
    <img src="https://img.shields.io/badge/chat-on%20Slack-blueviolet" alt="Slack community channel" />
  </a>
  <a href="https://twitter.com/infisical">
    <img src="https://img.shields.io/twitter/follow/infisical?label=Follow" alt="Infisical Twitter" />
  </a>
</h4>

<img src="/img/infisical_github_repo.png" width="100%" alt="Dashboard" />

**他の言語で読む**: <kbd>[<img title="English" alt="English language" src="https://cdn.staticaly.com/gh/hjnilsson/country-flags/master/svg/us.svg" width="22">](i18n/README.en.md)</kbd>
<kbd>[<img title="Spanish" alt="Spanish language" src="https://cdn.staticaly.com/gh/hjnilsson/country-flags/master/svg/es.svg" width="22">](i18n/README.es.md)</kbd>
<kbd>[<img title="German" alt="German language" src="https://cdn.staticaly.com/gh/hjnilsson/country-flags/master/svg/de.svg" width="22">](i18n/README.de.md)</kbd>
<kbd>[<img title="Korean" alt="Korean language" src="https://cdn.staticaly.com/gh/hjnilsson/country-flags/master/svg/kr.svg" width="22">](i18n/README.ko.md)</kbd>
<kbd>[<img title="Turkish" alt="Turkish language" src="https://cdn.staticaly.com/gh/hjnilsson/country-flags/master/svg/tr.svg" width="22">](i18n/README.tr.md)</kbd>
<kbd>[<img title="Bahasa Indonesia" alt="Bahasa Indonesia language" src="https://cdn.staticaly.com/gh/hjnilsson/country-flags/master/svg/id.svg" width="22">](i18n/README.id.md)</kbd>
<kbd>[<img title="Japanese" alt="Japanese language" src="https://cdn.staticaly.com/gh/hjnilsson/country-flags/master/svg/jp.svg" width="22">](i18n/README.ja.md)</kbd>

**[Infisical](https://infisical.com)** は、オープンソースのエンドツーエンド暗号化シークレットマネージャーで、API キーや設定を一元管理するために使用することができます。 Infisical から、開発から本番までの開発ライフサイクル全体にわたって、これらの秘密を配布することができます。シンプルな設計で、数分で使い始めることができます。

-   プロジェクト内でチームのシークレットと構成を管理するための **[使いやすいダッシュボード](https://infisical.com/docs/getting-started/dashboard/project)**
-   essecret と構成をプルしてローカル ワークフローに挿入する、**[言語に依存しない CLI](https://infisical.com/docs/cli/overview)**
-   **[データを完全に制御](https://infisical.com/docs/self-hosting/overview)** - 任意のインフラストラクチャで自分でホスト
-   プロジェクトごとに**複数の環境をナビゲート** (例：開発、ステージング、本番など)
-   プロジェクトごとに**個人的なオーバーライド**
-   CI/CD および本番インフラストラクチャとの **[統合](https://infisical.com/docs/integrations/overview)**
-   **[Infisical API](https://infisical.com/docs/api-reference/overview/introduction)** - プラットフォームへの HTTPS リクエストを介してシークレットを管理します
-   **[シークレットのバージョン管理](https://infisical.com/docs/getting-started/dashboard/versioning)**でシークレットの変更履歴を表示
-   プロジェクトで実行されたすべてのアクションを記録する **[監査ログ](https://infisical.com/docs/getting-started/dashboard/audit-logs)**
-   シークレットの任意のスナップショットにロールバックするための **[ポイントインタイム シークレット リカバリ](https://infisical.com/docs/getting-started/dashboard/pit-recovery)**
-   環境ごとの **役割ベースのアクセス制御**
-   **2FA** (その他のオプションは近日公開予定)
-   🔜 AWS への**ワンクリックデプロイ**
-   🔜 **自動シークレットローテーション**
-   🔜 **スマートセキュリティアラート**
-   🔜 **秘密のローテーション**
-   🔜 **Slack と MS Teams** の統合

などなど。

## 🚀 開始する

すぐに始められるように、[スタートガイド](https://infisical.com/docs/getting-started/introduction)をご覧ください。

<p>
  <a href="https://infisical.com/docs/self-hosting/overview" target="_blank"><img src="https://user-images.githubusercontent.com/78047717/218910609-18a75846-51a9-420a-a9a9-5958ac9c5505.png" height=150 /> </a>
  <a href="https://app.infisical.com/signup" target="_blank"><img src="https://user-images.githubusercontent.com/78047717/218910520-b36a607f-af66-4a06-af10-6a2191ab02de.png" height=150></a>
</p>

## 🔥 かっこいい点は？

Infisical は、秘密管理をシンプルにし、デフォルトでエンドツーエンドで暗号化します。私たちは、<i>セキュリティチームだけでなく</i>、すべての開発者がもっとアクセスできるようにすることを使命としています。

[あるレポート](https://www.ekransystem.com/en/blog/secrets-management)によると、すべての組織がある程度デジタル機密を使用しているにもかかわらず、機密管理ソリューションを使用している組織はわずか10%です。

効率とセキュリティにこだわるなら、 Infisical はあなたにぴったりです。

現在、 Infisical をより充実させるために努力しています。何か統合が必要ですか、新しい機能が欲しいですか？お気軽に [issue の作成](https://github.com/Infisical/infisical/issues)または[コントリビュート](https://infisical.com/docs/contributing/overview)をリポジトリに直接投稿してください。
## 🔌 統合

現在、基礎を固め、秘密がどこでも同期できるように[統合](https://infisical.com/docs/integrations/overview)を構築中です。どんな協力も大歓迎です。 :)

<table>
<tr>
  <th>プラットフォーム </th>
  <th>フレームワーク</th>
</tr>
<tr>
  <td>

<table>
  <tbody>
    <tr>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/platforms/docker?ref=github.com">
          ✔️ Docker
        </a>
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/platforms/docker-compose?ref=github.com">
          ✔️ Docker Compose
        </a>
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/cloud/heroku?ref=github.com">
          ✔️ Heroku
        </a>
      </td>
    </tr>
    <tr>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/cloud/vercel?ref=github.com">
          ✔️ Vercel
        </a>
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/platforms/kubernetes?ref=github.com">
          ✔️ Kubernetes
        </a>
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/cloud/flyio">
          ✔️ Fly.io
        </a>
      </td>
    </tr>
    <tr>
      <td align="left" valign="middle">
         🔜 Supabase
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/cicd/githubactions">
          ✔️ GitHub Actions
        </a>
      </td>
      <td align="left" valign="middle">
         🔜 Railway (https://github.com/Infisical/infisical/issues/271)
      </td>
    </tr>
    <tr>
      <td align="left" valign="middle">
        🔜 GCP SM (https://github.com/Infisical/infisical/issues/285)
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/cicd/gitlab">
          ✔️ GitLab CI/CD
        </a>
      </td>
      <td align="left" valign="middle">
        🔜 CircleCI (https://github.com/Infisical/infisical/issues/91)
      </td>
    </tr>
    <tr>
      <td align="left" valign="middle">
        🔜 Jenkins
      </td>
      <td align="left" valign="middle">
        🔜 Digital Ocean
      </td>
      <td align="left" valign="middle">
        🔜 Azure
      </td>
    </tr>
    <tr>
      <td align="left" valign="middle">
         🔜 TravisCI
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/cloud/aws-secret-manager">
          ✔️ AWS Secrets Manager
        </a>
      </td>
      <td align="left" valign="middle">
         🔜 Forge
      </td>
    </tr>
    <tr>
      <td align="left" valign="middle">
         🔜 Bitbucket
      </td>
      <td align="left" valign="middle">
          <a href="https://infisical.com/docs/integrations/cloud/aws-parameter-store">
            ✔️ AWS Parameter Store
          </a>
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/cloud/render">
          ✔️ Render
        </a>
      </td>
    </tr>
    <tr>
      <td align="left" valign="middle">
         🔜 BuddyCI
      </td>
      <td align="left" valign="middle">
         🔜 Serverless
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/cloud/netlify">
          ✔️ Netlify
        </a>
      </td>
    </tr>
  </tbody>
</table>

  </td>
<td>

<table>
  <tbody>
    <tr>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/react?ref=github.com">
          ✔️ React
        </a>
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/express?ref=github.com">
          ✔️ Express
        </a>
      </td>
    </tr>
    <tr>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/gatsby?ref=github.com">
          ✔️ Gatsby
        </a>
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/flask?ref=github.com">
          ✔️ Flask
        </a>
      </td>
    </tr>
    <tr>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/django?ref=github.com">
          ✔️ Django
        </a>
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/laravel?ref=github.com">
          ✔️ Laravel
        </a>
      </td>
    </tr>
    <tr>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/nestjs?ref=github.com">
          ✔️ NestJS
        </a>
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/remix?ref=github.com">
          ✔️ Remix
        </a>
      </td>
    </tr>
    <tr>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/nextjs?ref=github.com">
          ✔️ Next.js
        </a>
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/vite?ref=github.com">
          ✔️ Vite
        </a>
      </td>
    </tr>
    <tr>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/vue?ref=github.com">
          ✔️ Vue
        </a>
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/rails?ref=github.com">
          ✔️ Ruby on Rails
        </a>
      </td>
    </tr>
    <tr>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/fiber?ref=github.com">
          ✔️ Fiber
        </a>
      </td>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/nuxt?ref=github.com">
          ✔️ Nuxt
        </a>
      </td>
    </tr>
    <tr>
      <td align="left" valign="middle">
        <a href="https://infisical.com/docs/integrations/frameworks/dotnet?ref=github.com">
          ✔️ .NET
        </a>
      </td>
      <td align="left" valign="middle">
        などなど。。。
      </td>
    </tr>
  </tbody>
</table>

</td>
</tr>
</table>

## 💚 コミュニティ & サポート

-   [Slack](https://join.slack.com/t/infisical-users/shared_invite/zt-1kdbk07ro-RtoyEt_9E~fyzGo_xQYP6g) (コミュニティと Infisical チームとのライブディスカッション用)
-   [GitHub Discussions](https://github.com/Infisical/infisical/discussions) (機能に関する構築や深い会話の手助けに)
-   [GitHub Issues](https://github.com/Infisical/infisical-cli/issues) (Infisical を使用して発生したバグやエラーについて)
-   [Twitter](https://twitter.com/infisical) (ニュースを素早く入手する)

## 🏘 オープンソースと有料の比較

このレポは完全に MIT ライセンスです。ただし、 `ee` ディレクトリは将来的にInfisicalライセンスが必要なプレミアムエンタープライズ機能を含む予定です。私たちは現在、ほとんどのユースケースに対応できるよう、まず非エンタープライズ向け製品の開発に注力しています。

## 🛡 セキュリティ

セキュリティの脆弱性を報告したいですか？ GitHub の issue に投稿しないでください。代わりに、私たちの [SECURITY.md](./SECURITY.md) ファイルを参照してください。

## 🚨 Stay Up-to-Date

Infisical は、2022年11月21日に v.1.0 として正式に発売されました。非常に頻繁に多くの新機能が登場します。このリポジトリの **releases** を見て、将来のアップデートについて通知してください：

![infisical-star-github](https://github.com/Infisical/infisical/blob/main/.github/images/star-infisical.gif?raw=true)

## 🌱 コントリビュート

大小にかかわらず、私たちはコントリビュートが大好きです ❤️ [始め方](https://infisical.com/docs/contributing/overview)は、ガイドで確認してください。

何から始めたらいいのかわからない？あなたは、次のことができます：

-   [チームメイトとの無料ペアリングをご予約ください](mailto:tony@infisical.com?subject=Pairing%20session&body=I'd%20like%20to%20do%20a%20pairing%20session!)！
-   <a href="https://join.slack.com/t/infisical-users/shared_invite/zt-1kdbk07ro-RtoyEt_9E~fyzGo_xQYP6g">Slack</a> に参加して、そこで何でも質問してください。

## 🦸 コントリビューター

[//]: contributor-faces

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

<a href="https://github.com/dangtony98"><img src="https://avatars.githubusercontent.com/u/25857006?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/maidul98"><img src="https://avatars.githubusercontent.com/u/9300960?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/akhilmhdh"><img src="https://avatars.githubusercontent.com/u/31166322?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/reginaldbondoc"><img src="https://avatars.githubusercontent.com/u/7693108?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/mv-turtle"><img src="https://avatars.githubusercontent.com/u/78047717?s=96&v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/gangjun06"><img src="https://avatars.githubusercontent.com/u/50910815?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/asheliahut"><img src="https://avatars.githubusercontent.com/u/945619?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/SH5H"><img src="https://avatars.githubusercontent.com/u/25437192?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/gmgale"><img src="https://avatars.githubusercontent.com/u/62303146?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/asharonbaltazar"><img src="https://avatars.githubusercontent.com/u/58940073?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/JoaoVictor6"><img src="https://avatars.githubusercontent.com/u/68869379?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/mocherfaoui"><img src="https://avatars.githubusercontent.com/u/37941426?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/cerrussell"><img src="https://avatars.githubusercontent.com/u/80227828?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/jon4hz"><img src="https://avatars.githubusercontent.com/u/26183582?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/edgarrmondragon"><img src="https://avatars.githubusercontent.com/u/16805946?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/arjunyel"><img src="https://avatars.githubusercontent.com/u/11153289?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/LemmyMwaura"><img src="https://avatars.githubusercontent.com/u/20738858?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Zamion101"><img src="https://avatars.githubusercontent.com/u/8071263?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Grraahaam"><img src="https://avatars.githubusercontent.com/u/72856427?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Neeraj138"><img src="https://avatars.githubusercontent.com/u/58552561?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/esau-morais"><img src="https://avatars.githubusercontent.com/u/55207584?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/animeshdas2000"><img src="https://avatars.githubusercontent.com/u/40542456?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/umrak11"><img src="https://avatars.githubusercontent.com/u/20104948?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/KunalSin9h"><img src="https://avatars.githubusercontent.com/u/82411321?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/ImBIOS"><img src="https://avatars.githubusercontent.com/u/41441643?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/sanyamjain04"><img src="https://avatars.githubusercontent.com/u/107163858?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Gabriellopes232"><img src="https://avatars.githubusercontent.com/u/74881862?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/naorpeled"><img src="https://avatars.githubusercontent.com/u/6171622?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Aashish-Upadhyay-101"><img src="https://avatars.githubusercontent.com/u/81024263?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/jonerrr"><img src="https://avatars.githubusercontent.com/u/73760377?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/kmlgkcy"><img src="https://avatars.githubusercontent.com/u/102428035?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/samsbg"><img src="https://avatars.githubusercontent.com/u/70488844?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/imakecodes"><img src="https://avatars.githubusercontent.com/u/35536648?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/kimcore"><img src="https://avatars.githubusercontent.com/u/36142378?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/caioluis"><img src="https://avatars.githubusercontent.com/u/30005368?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/adrianmarinwork"><img src="https://avatars.githubusercontent.com/u/118568289?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/arthurzenika"><img src="https://avatars.githubusercontent.com/u/445200?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/franky47"><img src="https://avatars.githubusercontent.com/u/1174092?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/hanywang2"><img src="https://avatars.githubusercontent.com/u/44352119?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/tobias-mintlify"><img src="https://avatars.githubusercontent.com/u/110702161?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/wjhurley"><img src="https://avatars.githubusercontent.com/u/15939055?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/alexdanilowicz"><img src="https://avatars.githubusercontent.com/u/29822597?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/0xflotus"><img src="https://avatars.githubusercontent.com/u/26602940?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/wanjohiryan"><img src="https://avatars.githubusercontent.com/u/71614375?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/nirga"><img src="https://avatars.githubusercontent.com/u/4224692?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/RashidUjang"><img src="https://avatars.githubusercontent.com/u/11313829?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/kanhaiya38"><img src="https://avatars.githubusercontent.com/u/54778773?v=4" width="50" height="50" alt=""/></a>

## 🌎 翻訳

Infisical は現在、英語、韓国語、フランス語、ポルトガル語（ブラジル）、日本語で提供されています。あなたの言語への Infisical の翻訳にご協力ください！

すべての情報は[この issue](https://github.com/Infisical/infisical/issues/181) に掲載されています。
