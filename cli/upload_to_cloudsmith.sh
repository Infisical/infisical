cd dist
for i in *.apk; do
    [ -f "$i" ] || break
    cloudsmith push alpine --republish infisical/infisical-cli/alpine/any-version $i
done

# for i in *.deb; do
#     [ -f "$i" ] || break
#     cloudsmith push deb --republish infisical/infisical-cli/any-distro/any-version $i
# done

for i in *.deb; do
    [ -f "$i" ] || break
    deb-s3 upload --bucket=$INFISICAL_CLI_S3_BUCKET --prefix=deb --visibility=private --sign=$INFISICAL_CLI_REPO_SIGNING_KEY_ID --preserve-versions  $i
done


for i in *.rpm; do
    [ -f "$i" ] || break
    cloudsmith push rpm --republish infisical/infisical-cli/any-distro/any-version $i
done
