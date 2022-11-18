cd dist
for i in *.apk; do
    [ -f "$i" ] || break
    cloudsmith push alpine infisical/infisical-cli/alpine/any-version $i
done

for i in *.deb; do
    [ -f "$i" ] || break
    cloudsmith push deb --no-republish infisical/infisical-cli/debian/any-version $i
done

for i in *.rpm; do
    [ -f "$i" ] || break
    cloudsmith push rpm --no-republish infisical/infisical-cli/any-distro/any-version $i
done