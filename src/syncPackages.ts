import path from 'path'
import {
  getPackageHashes,
  PackageInfo,
  PackageInfoMap,
} from './getPackageHashes'
import { S3 } from './s3Client'
import { env } from './env'
import fs, { Stats } from 'fs-extra'
import execa from 'execa'
import { root, cacheDir } from './paths'
import { downloadFromS3 } from './downloadFromS3'
import filesize from 'filesize'
import { Interleaver, ITaskWriter } from './Interleaver'
import chalk from 'chalk'
import { HeadObjectOutput } from 'aws-sdk/clients/s3'
import { writeTar, extractTar } from './tar'
import { getGlobalHash } from 'getGlobalHash'

const existsInLocalCacheCache: { [key: string]: Stats | false } = {}
const getExistsInLocalCache = async (key: string): Promise<Stats | false> => {
  const value = existsInLocalCacheCache[key]
  if (value !== undefined) {
    return existsInLocalCacheCache[key]
  }
  try {
    const stats = await fs.stat(path.join(cacheDir, key))
    existsInLocalCacheCache[key] = stats
    return stats
  } catch (e) {
    existsInLocalCacheCache[key] = false
    return false
  }
}

const existsInRemoteCacheCache: {
  [key: string]: HeadObjectOutput | false
} = {}
const getExistsInRemoteCache = async (
  key: string,
): Promise<HeadObjectOutput | false> => {
  const value = existsInRemoteCacheCache[key]
  if (value !== undefined) {
    return value
  }
  try {
    const headObject = await S3.headObject({
      Bucket: env.BEEZEL_AWS_BUCKET,
      Key: key,
    }).promise()
    existsInRemoteCacheCache[key] = headObject
    return headObject
  } catch (e) {
    existsInRemoteCacheCache[key] = false
    return false
  }
}

const readFromRemoteCache = async (
  { fileName, filePath }: PackageInfo,
  writer: PackageWriter,
) => {
  const info = await getExistsInRemoteCache(fileName)
  if (!info) throw new Error('Does not exists in remote cache.')
  const size = filesize(info.ContentLength || 0)
  writer.log(`Download (${size})`)
  const start = Date.now()
  await downloadFromS3({ key: fileName, to: filePath })
  writer.log(`Downloaded (${size}) in ${Date.now() - start}ms`)
}

const readFromLocalCache = async (
  { filePath, location }: PackageInfo,
  writer: PackageWriter,
) => {
  writer.log('Extract')
  const start = Date.now()
  await extractTar({
    from: filePath,
    to: path.join(root, location),
  })
  writer.log(`Extracted in ${Date.now() - start}ms`)
}

const writeToLocalCache = async (
  info: PackageInfo,
  writer: PackageWriter,
): Promise<void> => {
  const existsInLocalCache = await getExistsInLocalCache(info.fileName)
  if (existsInLocalCache) {
    writer.log('Already Locally Cached')
    return undefined
  }

  const { filePath, location } = info
  const cwd = path.join(root, location)

  // It's not on S3, time to tar it and upload.
  const untracked = execa.sync('git', ['ls-files', '-o'], { cwd }).stdout
  const untrackedArray = untracked
    .split('\n')
    .filter(v => !v.startsWith('node_modules') && !v.startsWith('.'))

  if (untrackedArray.length === 0) {
    // An empty file.
    await fs.createFile(filePath)
  } else {
    await writeTar({ entries: untrackedArray, cwd, path: filePath })
  }
}

const writeToRemoteCache = async (
  info: PackageInfo,
  writer: PackageWriter,
): Promise<void> => {
  const existsInRemoteCache = await getExistsInRemoteCache(info.fileName)
  if (existsInRemoteCache) {
    writer.log('Already Remotely Cached')
    return undefined
  }

  const { filePath, fileName } = info
  const size = fs.statSync(filePath).size
  const sizeString = filesize(size, { unix: true })
  const body = await fs.readFile(filePath)
  writer.log(`Upload (${sizeString})`)
  const start = Date.now()
  await S3.upload({
    Bucket: env.BEEZEL_AWS_BUCKET,
    Key: fileName,
    Body: body,
  }).promise()
  writer.log(`Uploaded (${sizeString}) in ${Date.now() - start}ms`)
}

const colorWheel: string[] = [
  'cyan',
  'magenta',
  'blue',
  'yellow',
  'green',
  'red',
]
let currentColor = 0
const getNextColor = (): string =>
  colorWheel[currentColor++ % colorWheel.length]

interface PackageWriter extends ITaskWriter {
  log: (message: string) => void
}

const getWriters = (
  packageInfoMap: PackageInfoMap,
): { [key: string]: PackageWriter } =>
  Object.fromEntries(
    Object.entries(packageInfoMap).map(([key]) => {
      const writer = Interleaver.registerTask(key)
      const colorName = getNextColor()
      const color: typeof chalk.red = (chalk as any)[colorName] as any
      return [
        key,
        {
          ...writer,
          log: (message: string) =>
            writer.writeLine(`${color.bold(key)}: ${message}`),
        },
      ]
    }),
  )

export const syncPackages = async (): Promise<void> => {
  const cachedPackages: { [key: string]: boolean } = {}
  const packageHashes = await getPackageHashes()
  const packageHashesValues = Object.values(packageHashes).filter(
    info => info.hasBuildStep,
  )
  Interleaver.setStdOut(process.stdout)

  console.log('-----------------------------------')

  console.log('Download Packages')
  const globalHash = await getGlobalHash()
  console.log(`${chalk.bold('Global hash')}: ${globalHash}`)
  console.time('Download Packages')
  const downloadWriters = getWriters(packageHashes)
  await Promise.all(
    packageHashesValues.map(async info => {
      const writer = downloadWriters[info.name]
      writer.log(info.hash)
      const existsLocally = await getExistsInLocalCache(info.fileName)
      if (existsLocally) {
        writer.log('Local Cache Hit')
        await readFromLocalCache(info, writer)
        cachedPackages[info.name] = true
        writer.close()
        return
      }

      const existsRemotely = await getExistsInRemoteCache(info.fileName)
      if (existsRemotely) {
        writer.log('Remote Cache Hit')
        await readFromRemoteCache(info, writer)
        await readFromLocalCache(info, writer)
        cachedPackages[info.name] = true
        writer.close()
        return
      }

      // It's not in our local cache or in the remote cache, so must be build.
      // Actually some packages may just not have a build command.
      // In that case nothing will be uploaded to S3.
      writer.log(`Cache Miss`)
      writer.close()
    }),
  )
  Interleaver.reset()
  console.timeEnd('Download Packages')

  console.log('-----------------------------------')

  console.log('Build')
  console.time('Build')
  const buildPackages = packageHashesValues
    .filter(v => !cachedPackages[v.name])
    .map(v => v.name)
  const scopeArgs = buildPackages.flatMap(name => ['--scope', name])
  if (buildPackages.length) {
    const args = ['run', 'build', '--stream', '--reject-cycles', ...scopeArgs]
    console.log(`lerna ${args.join(' ')}`)
    await execa('lerna', args, {
      stdout: 'inherit',
      preferLocal: true,
      cwd: root,
    })
  } else {
    console.log('Everything was cached!')
  }
  console.timeEnd('Build')

  console.log('-----------------------------------')

  console.log('Upload Packages')
  console.time('Upload Packages')
  const uploadWriters = getWriters(packageHashes)
  await Promise.all(
    packageHashesValues.map(async info => {
      if (cachedPackages[info.name]) {
        return
      }
      const writer = uploadWriters[info.name]
      await writeToLocalCache(info, writer)
      await writeToRemoteCache(info, writer)
      writer.close()
    }),
  )
  Interleaver.reset()
  console.timeEnd('Upload Packages')

  console.log('-----------------------------------')
}
