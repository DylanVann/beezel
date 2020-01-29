# Beezel

Remote build caching for JS monorepos.

## Prerequisits

You should have a yarn workspaces project where packages are contained in `packages/*`.
This is currently the only structure Beezel supports.

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
BEEZEL_AWS_S3_BUCKET_NAME="Your bucket name."
# This can be used to cache bust Beezel.
BEEZEL_CACHE_KEY="v2"
```

## Usage

```bash
# Just run this to build or fetch your packages.
beezel
```
