FROM rust:1.95.0-bookworm

ARG CARGO_NEAR_VERSION=0.21.1

ENV CARGO_TERM_COLOR=always
ENV PATH="/root/.cargo/bin:${PATH}"

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    build-essential \
    ca-certificates \
    clang \
    curl \
    git \
    libssl-dev \
    libudev-dev \
    pkg-config \
  && rm -rf /var/lib/apt/lists/*

RUN rustup toolchain install 1.95.0 --profile minimal \
  && rustup target add wasm32-unknown-unknown --toolchain 1.95.0 \
  && cargo install cargo-near --version "${CARGO_NEAR_VERSION}" --locked \
  && curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.sh | sh \
  && rustc +1.95.0 --version \
  && cargo-near --version \
  && near --version

WORKDIR /workspace

