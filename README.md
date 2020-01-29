# Beezel

Remote build caching for JS monorepos.

## Prerequisits

- Beezel supports Yarn workspaces / Lerna (using Yarn workspaces).

## Installation

```bash
yarn add -D -W beezel
```

## Configuration

Use these environment variables to configure Beezel.

```bash
# Beezel needs credentials for AWS S3 access.
BEEZEL_AWS_ID="Your id."
BEEZEL_AWS_SECRET="Your secret."
BEEZEL_AWS_BUCKET="Your bucket name."
# This can be used to cache bust Beezel.
BEEZEL_CACHE_KEY="v2"
```

## Usage

```bash
# Just run this to build or fetch your packages.
beezel
```
