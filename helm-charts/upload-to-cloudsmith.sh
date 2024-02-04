## Loop through each helm chart directoy and build each into helm package
for d in */ ; do
    cd "$d"
    helm dependency update
    helm package .
    for i in *.tgz; do
        [ -f "$i" ] || break
        cloudsmith push helm --republish infisical/helm-charts "$i"
    done
    cd ..
done

# ## Upload each packaged helm chart 
# for i in *.tgz; do
#     [ -f "$i" ] || break
#     cloudsmith push helm --republish infisical/helm-charts $i
# done