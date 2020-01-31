import path from 'path'
import { getYarnHash } from './getYarnHash'
import {
  getExistsInLocalCache,
  getExistsInRemoteCache,
  readFromRemoteCache,
  writeToRemoteCache,
} from './syncPackages'
import { root, cacheDir } from 'paths'
import execa from 'execa'
import fg from 'fast-glob'
import chalk from 'chalk'
import * as tar from 'tar'

export const syncYarn = async (): Promise<void> => {
  const key: string = await getYarnHash()
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

  const existsLocally = await getExistsInLocalCache(key)
  if (existsLocally) {
    writer.log('Local Cache Hit')
    await extract()
    return
  }

  const existsRemotely = await getExistsInRemoteCache(key)
  if (existsRemotely) {
    writer.log('Remote Cache Hit')
    await readFromRemoteCache({
      key,
      writer,
    })
    await extract()
    return
  }

  await execa('yarn', ['install', '--frozen-lockfile'], {
    stdio: 'inherit',
    cwd: root,
  })

  const packageModulesDirectories = await fg('packages/*/node_modules', {
    cwd: root,
    onlyDirectories: true,
  })
  const directoriesToCache = ['node_modules', ...packageModulesDirectories]

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
  })
}
