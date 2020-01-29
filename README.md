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
BEEZEL_AWS_TOKEN="Your token."
# You will need to create this bucket.
# It's recommended that you add a lifecycle rule to delete stale files.
# Or the size of the remote cache will grow indefinitely.
# It is also recommended to configure the bucket so it will be as fast as possible.
BEEZEL_AWS_BUCKET="Your bucket."
```

## Usage

```bash
# Just run this to build or fetch your packages.
beezel
```
