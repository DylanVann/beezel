import fs from 'fs-extra'
import path from 'path'
import { getYarnHash } from './getYarnHash'
import {
  getExistsInLocalCache,
  getExistsInRemoteCache,
  readFromRemoteCache,
  writeToRemoteCache,
} from './syncPackages'
import execa from 'execa'
import fg from 'fast-glob'
import chalk from 'chalk'
import * as tar from 'tar'
import expandTilde from 'expand-tilde'
import AWS from 'aws-sdk'

export const syncYarn = async ({
  globalHash,
  cacheDir,
  root,
  awsBucket,
  s3,
  otherYarnCaches,
}: {
  globalHash: string
  cacheDir: string
  root: string
  awsBucket: string
  s3: AWS.S3
  otherYarnCaches: string[]
}): Promise<void> => {
  const key: string = await getYarnHash({ globalHash, root })
  const writer = {
    log: (message: string) => console.log(`${chalk.bold('Yarn')}: ${message}`),
    close: () => {},
  }
  writer.log(key)

  const extract = async () => {
    writer.log('Extract')
    const start = Date.now()
    await tar.extract({
      file: path.join(cacheDir, key),
      cwd: root,
    })
    writer.log(`Extracted in ${Date.now() - start}ms`)
  }

  const runYarn = async () => {
    await execa('yarn', ['install', '--frozen-lockfile'], {
      cwd: root,
      all: true,
      stdio: 'inherit',
    })
  }

  const existsLocally = await getExistsInLocalCache(key, cacheDir)
  if (existsLocally) {
    writer.log('Local Cache Hit')
    await extract()
    await runYarn()
    return
  }

  const existsRemotely = await getExistsInRemoteCache({ key, awsBucket, s3 })
  if (existsRemotely) {
    writer.log('Remote Cache Hit')
    await readFromRemoteCache({
      key,
      writer,
      awsBucket,
      cacheDir,
      s3,
    })
    await extract()
    await runYarn()
    return
  }

  writer.log('Cache Miss')
  await runYarn()

  const packageModulesDirectories = await fg('packages/*/node_modules', {
    cwd: root,
    onlyDirectories: true,
  })
  const otherYarnCachesPaths = otherYarnCaches.filter((p) =>
    fs.existsSync(path.join(root, p)),
  )
  const directoriesToCache = [
    'node_modules',
    ...otherYarnCachesPaths.map(expandTilde),
    ...packageModulesDirectories,
  ]

  writer.log('Writing Archive')
  const start = Date.now()
  await tar.create(
    {
      cwd: root,
      file: path.join(cacheDir, key),
      gzip: true,
    },
    directoriesToCache,
  )
  writer.log(`Wrote in ${Date.now() - start}ms`)

  await writeToRemoteCache({
    key,
    writer,
    cacheDir,
    awsBucket,
    s3,
  })
}
