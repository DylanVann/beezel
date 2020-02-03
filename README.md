# Beezel

Remote build caching for JS monorepos.

## Prerequisits

- Beezel supports Yarn workspaces / Lerna (using Yarn workspaces).

## Installation

Beezel caches `node_modules` and `packages/*/node_modules` for you, so its code must be accessible before running `yarn`.
To accomplish this you can use this script to put Beezel in your project. Beezel is distributed as a single file `beezel`, which is a node script.

```bash
# Currently only works on macOS / Linux.
curl -L https://raw.githubusercontent.com/DylanVann/beezel/master/bin/install | node
```

You will need to commit the `beezel` file.

## Configuration

Use these environment variables to configure Beezel.

```bash
# Beezel needs credentials for AWS S3 access.
BEEZEL_AWS_ID="Your id."
BEEZEL_AWS_SECRET="Your secret."
BEEZEL_AWS_BUCKET="Your bucket name."
# This can be used to cache bust Beezel.
BEEZEL_CACHE_KEY="v2"
# This could speed up S3.
AWS_NODEJS_CONNECTION_REUSE_ENABLED=1
```

## Usage

```bash
# Run this to:
# - Run Yarn (with remote caching).
# - Build packages (with remote caching).
beezel
```

## Tips

- Enable [S3 transfer acceleration](https://docs.aws.amazon.com/AmazonS3/latest/dev/transfer-acceleration.html) on your S3 bucket.
- Enable [Keep-Alive](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/node-reusing-connections.html) for S3 by setting `AWS_NODEJS_CONNECTION_REUSE_ENABLED` to `1`.
- Instead of persisting to workspaces during a fan-out build (e.g. `persist_to_workspace` on CircleCI) you can run Beezel in each spawned container, this may be faster.
- You should remove any existing caching of `node_modules` on CI, since Beezel does this.

## How it works?

Beezel operates on the package level.

The hash of a package depends on:

- A hash of the source files in the package.
  - Only takes into account files that are not gitignored.
- A hash taking into account internal dependencies.
  - e.g. A depends on B, then the hash for A will take into account the hash of B..
  - e.g. A depends on B, if B changes then A needs to be rebuilt.
- A hash taking into account global dependencies.
  - This takes into account your root `yarn.lock` file.
  - e.g. If `yarn.lock` changes everything must be rebuilt.
  - It can take into account any config files at the root of your repo.
  - This is configured by setting `beezel.globalDependencies`.

After a package is built an archive is created for it.
The archive will contain any gitignored files in the package folder.
The archive is uploaded to S3 with the cache key in the filename so that on the next build we can download this file instead of building from scratch.
