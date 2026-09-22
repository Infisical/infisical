# The binary is cross-compiled on the host and copied in, rather than built in a
# golang stage: the module cache is already warm from running tests, so this is a
# second where an in-Docker build would download the whole module graph.
FROM scratch
COPY fakenet /fakenet
EXPOSE 53/udp 443 8080
ENTRYPOINT ["/fakenet"]
