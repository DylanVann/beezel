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
import { Interleaver } from './Interleaver'
import chalk from 'chalk'
import { HeadObjectOutput } from 'aws-sdk/clients/s3'
import { writeTar, extractTar } from './tarUtils'
import { getGlobalHash } from 'getGlobalHash'

export const getExistsInLocalCache = async (
  key: string,
): Promise<Stats | false> => {
  try {
    const stats = await fs.stat(path.join(cacheDir, key))
    return stats
  } catch (e) {
    return false
  }
}

export const getExistsInRemoteCache = async (
  key: string,
): Promise<HeadObjectOutput | false> => {
  try {
    const headObject = await S3.headObject({
      Bucket: env.BEEZEL_AWS_BUCKET,
      Key: key,
    }).promise()
    return headObject
  } catch (e) {
    return false
  }
}

export const readFromRemoteCache = async ({
  key,
  writer,
}: {
  key: string
  writer: PackageWriter
}) => {
  const info = await getExistsInRemoteCache(key)
  if (!info) throw new Error('Does not exists in remote cache.')
  const size = filesize(info.ContentLength || 0)
  writer.log(`Download (${size})`)
  const start = Date.now()
  await downloadFromS3({ key, to: path.join(cacheDir, key) })
  writer.log(`Downloaded (${size}) in ${Date.now() - start}ms`)
}

export const readFromLocalCache = async ({
  key,
  to,
  writer,
}: {
  key: string
  to: string
  writer: PackageWriter
}) => {
  writer.log('Extract')
  const start = Date.now()
  await extractTar({
    from: path.join(cacheDir, key),
    to: to,
  })
  writer.log(`Extracted in ${Date.now() - start}ms`)
}

const writePackageToLocalCache = async (info: PackageInfo): Promise<void> => {
  const { hash, location } = info
  const cwd = path.join(root, location)

  // It's not on S3, time to tar it and upload.
  const untracked = execa.sync('git', ['ls-files', '-o'], { cwd }).stdout
  const untrackedArray = untracked
    .split('\n')
    .filter(v => !v.startsWith('node_modules') && !v.startsWith('.'))

  if (untrackedArray.length === 0) {
    // An empty file.
    await fs.createFile(path.join(cacheDir, hash))
  } else {
    await writeTar({
      entries: untrackedArray,
      cwd,
      path: path.join(cacheDir, hash),
    })
  }
}

export const writeToRemoteCache = async ({
  key,
  writer,
}: {
  key: string
  writer: PackageWriter
}): Promise<void> => {
  const filePath = path.join(cacheDir, key)
  const size = fs.statSync(filePath).size
  const sizeString = filesize(size, { unix: true })
  const body = await fs.readFile(filePath)
  writer.log(`Upload (${sizeString})`)
  const start = Date.now()
  await S3.upload({
    Bucket: env.BEEZEL_AWS_BUCKET,
    Key: key,
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

interface PackageWriter {
  log: (message: string) => void
  close: () => void
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
      const existsLocally = await getExistsInLocalCache(info.hash)
      if (existsLocally) {
        writer.log('Local Cache Hit')
        await readFromLocalCache({
          key: info.hash,
          to: path.join(root, info.location),
          writer,
        })
        cachedPackages[info.name] = true
        writer.close()
        return
      }

      const existsRemotely = await getExistsInRemoteCache(info.hash)
      if (existsRemotely) {
        writer.log('Remote Cache Hit')
        await readFromRemoteCache({
          key: info.hash,
          writer,
        })
        await readFromLocalCache({
          key: info.hash,
          to: path.join(root, info.location),
          writer,
        })
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
      await writePackageToLocalCache(info)
      await writeToRemoteCache({
        key: info.hash,
        writer,
      })
      writer.close()
    }),
  )
  Interleaver.reset()
  console.timeEnd('Upload Packages')

  console.log('-----------------------------------')
}
