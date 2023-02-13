FROM alpine
RUN apk add --no-cache tini
COPY infisical /bin/infisical
ENTRYPOINT ["/sbin/tini", "--", "/bin/infisical"]