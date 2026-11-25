FROM debian:bookworm-slim
ARG TARGETARCH
ARG ARDUINO_CLI_VERSION=1.5.1
ARG ESP32=false
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl tar bzip2 xz-utils \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "${TARGETARCH}" in amd64) cli_arch=64bit ;; arm64) cli_arch=ARM64 ;; *) exit 1 ;; esac; \
    archive="arduino-cli_${ARDUINO_CLI_VERSION}_Linux_${cli_arch}.tar.gz"; \
    base="https://github.com/arduino/arduino-cli/releases/download/v${ARDUINO_CLI_VERSION}"; \
    curl -fLsS --retry 3 "$base/$archive" -o "/tmp/$archive"; \
    curl -fLsS --retry 3 "$base/${ARDUINO_CLI_VERSION}-checksums.txt" -o /tmp/checksums; \
    cd /tmp; grep "  $archive\$" checksums | sha256sum -c -; \
    tar -xzf "$archive" -C /usr/local/bin arduino-cli; \
    tar -xzf "$archive" -C /usr/local/share LICENSE.txt; \
    rm "$archive" checksums
ENV ARDUINO_DIRECTORIES_DATA=/opt/arduino/data \
    ARDUINO_DIRECTORIES_USER=/workspace \
    ARDUINO_DIRECTORIES_DOWNLOADS=/tmp/arduino-downloads \
    ARDUINO_BOARD_MANAGER_ADDITIONAL_URLS=https://espressif.github.io/arduino-esp32/package_esp32_index.json \
    ARDUINO_UPDATER_ENABLE_NOTIFICATION=false
RUN arduino-cli core update-index \
    && arduino-cli core install arduino:avr@1.8.8 \
    && if [ "$ESP32" = true ]; then arduino-cli core install esp32:esp32@3.3.12; fi \
    && rm -rf /tmp/arduino-downloads
COPY LICENSE THIRD_PARTY.md /usr/local/share/pinway/
WORKDIR /workspace
ENTRYPOINT ["arduino-cli"]
CMD ["version"]
