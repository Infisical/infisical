cd dist
for i in *.apk; do
    [ -f "$i" ] || break
    cloudsmith push alpine --republish infisical/infisical-cli/alpine/any-version $i
done

for i in *.deb; do
    [ -f "$i" ] || break
    cloudsmith push deb --republish infisical/infisical-cli/any-distro/any-version $i
done

for i in *.rpm; do
    [ -f "$i" ] || break
    cloudsmith push rpm --republish infisical/infisical-cli/any-distro/any-version $i
done