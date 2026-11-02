# Same Batteries binary pin as the console's base stack, plus an optional reader credential.
FROM golang:1.27.2-bookworm AS build
WORKDIR /src
RUN git init \
    && git remote add origin https://github.com/livepeer/clearinghouse-batteries.git \
    && git fetch --depth 1 origin ca09e47c067682fb48c3f15425546fb6aa5b6659 \
    && git checkout --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = ca09e47c067682fb48c3f15425546fb6aa5b6659
RUN go mod download
RUN CGO_ENABLED=1 go build -trimpath -o /out/clearinghouse ./cmd/clearinghouse

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates python3 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/clearinghouse /usr/local/bin/clearinghouse
COPY base-entrypoint.py /usr/local/bin/entrypoint.py
COPY console_reader.py /usr/local/bin/console_reader.py
RUN python3 -c 'from pathlib import Path; import sys; sys.path.insert(0,"/usr/local/bin"); from console_reader import patched_entrypoint; p=Path("/usr/local/bin/entrypoint.py"); p.write_text(patched_entrypoint(p.read_text()))'
EXPOSE 8080 8081 9092
ENTRYPOINT ["python3", "-u", "/usr/local/bin/entrypoint.py"]
