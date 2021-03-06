#!/usr/bin/env node

import 'hard-rejection/register'
import fs from 'fs-extra'
import { syncYarn } from 'syncYarn'
import { syncPackages } from './syncPackages'
import path from 'path'
import expandTilde from 'expand-tilde'
import findWorkspaceRoot from 'find-yarn-workspace-root'
import chalk from 'chalk'
import yargs from 'yargs'
import { getGitHashForFiles } from '@rushstack/package-deps-hash'
import objectHash from 'object-hash'
import AWS from 'aws-sdk'

// If this changes we do a full rebuild.
// It should include any global dependencies.
const getGlobalHash = async ({
  globalDependencies = [],
  root,
  otherYarnCaches,
  cacheKey,
}: {
  globalDependencies?: string[]
  otherYarnCaches?: string[]
  root: string
  cacheKey: string
}): Promise<string> => {
  const deps = [...new Set([...globalDependencies, 'yarn.lock'])]
  const hashMap = getGitHashForFiles(deps, root)
  return objectHash([hashMap, otherYarnCaches, cacheKey])
}

interface Config {
  otherYarnCaches: string[]
  globalDependencies: string[]
  cacheKey: string
  cacheFolder: string
}

interface BuildEnvironment {
  awsId: string
  awsSecret: string
  awsBucket: string
  cacheKey: string
  cacheFolder: string
  otherYarnCaches: string[]
  globalDependencies: string[]
  root: string
  s3: AWS.S3
}

const runYarn = async ({
  cacheKey,
  cacheFolder,
  root,
  awsBucket,
  s3,
  otherYarnCaches,
  globalDependencies,
}: BuildEnvironment) => {
  const globalHash = await getGlobalHash({
    otherYarnCaches: otherYarnCaches,
    globalDependencies: globalDependencies,
    root: root,
    cacheKey: cacheKey,
  })
  console.log(`${chalk.bold('Global hash')}: ${globalHash}`)
  await fs.ensureDir(cacheFolder)
  await syncYarn({
    cacheFolder,
    globalHash,
    root,
    awsBucket,
    s3,
    otherYarnCaches,
  })
}

const runBuild = async ({
  cacheKey,
  cacheFolder,
  root,
  awsBucket,
  s3,
  otherYarnCaches,
  globalDependencies,
}: BuildEnvironment) => {
  const globalHash = await getGlobalHash({
    otherYarnCaches: otherYarnCaches,
    globalDependencies: globalDependencies,
    root: root,
    cacheKey: cacheKey,
  })
  console.log(`${chalk.bold('Global hash')}: ${globalHash}`)
  await fs.ensureDir(cacheFolder)
  await syncPackages({
    cacheFolder,
    globalHash,
    root,
    awsBucket,
    s3,
  })
}

const options = {
  awsId: {
    type: 'string',
    demandOption: true,
  },
  awsSecret: {
    type: 'string',
    demandOption: true,
  },
  awsBucket: {
    type: 'string',
    demandOption: true,
  },
  cacheKey: {
    type: 'string',
    default: 'v1',
    description: 'Global cache key. Can be used for cache busting.',
  },
  cacheFolder: {
    type: 'string',
    default: './node_modules/.cache/beezel',
    description: "Where to store Beezel's cache locally.",
  },
  otherYarnCaches: {
    type: 'array',
    default: [] as string[],
    description: 'Other locations to include in the yarn cache.',
  },
  globalDependencies: {
    type: 'array',
    default: [] as string[],
    description: 'Files to take into account when determining the global hash.',
  },
} as const

const getRoot = (): string => {
  const root = findWorkspaceRoot(process.cwd())
  if (!root) {
    throw new Error('Could not find workspace root.')
  }
  return root
}

const getPackage = async (root: string): Promise<any> => {
  const packageJsonPath = path.join(root, 'package.json')
  const pkg = await fs.readJson(packageJsonPath)
  if (!pkg) {
    throw new Error(`Could not find package.json at ${packageJsonPath}`)
  }
  return pkg
}

const getAndPrintConfig = async (
  args: yargs.InferredOptionTypes<typeof options>,
): Promise<Config & { root: string }> => {
  const root = getRoot()
  const pkg = await getPackage(root)
  const configFromPackage: Partial<Config> = pkg.beezel || {}
  const transformCacheFolder = (folder: string) =>
    folder.startsWith('.') ? path.join(root, folder) : expandTilde(folder)
  const extractConfig = (c: Config): Config => ({
    cacheFolder: c.cacheFolder,
    cacheKey: c.cacheKey,
    globalDependencies: c.globalDependencies,
    otherYarnCaches: c.otherYarnCaches,
  })
  const config: Config = { ...extractConfig(args), ...configFromPackage }
  const finalConfig = {
    root,
    ...config,
    cacheFolder: transformCacheFolder(config.cacheFolder),
  }
  console.log(`Beezel - v${pkg.version}`)
  console.log('Configuration:')
  console.log(JSON.stringify(finalConfig, null, 2))
  return finalConfig
}

yargs
  .env('BEEZEL')
  .command(
    'install',
    'Install dependencies using yarn (or use remote cache).',
    (yargs) => yargs.options(options),
    async (args) => {
      const config = await getAndPrintConfig(args)
      const s3 = new AWS.S3({
        credentials: {
          accessKeyId: args.awsId,
          secretAccessKey: args.awsSecret,
        },
      })
      await runYarn({
        ...config,
        awsId: args.awsId,
        awsBucket: args.awsBucket,
        awsSecret: args.awsSecret,
        s3,
      })
    },
  )
  .command(
    'build',
    'Build all packages (or use remote cache).',
    (yargs) => yargs.options(options),
    async (args) => {
      const config = await getAndPrintConfig(args)
      const s3 = new AWS.S3({
        credentials: {
          accessKeyId: args.awsId,
          secretAccessKey: args.awsSecret,
        },
      })
      await runBuild({
        ...config,
        awsId: args.awsId,
        awsBucket: args.awsBucket,
        awsSecret: args.awsSecret,
        s3,
      })
    },
  )
  .demandCommand(1, '')
  .parse()
