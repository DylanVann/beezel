import path from 'path'
import {
  getPackageHashes,
  PackageInfo,
  PackageInfoMap,
} from './getPackageHashes'
import fs, { Stats } from 'fs-extra'
import execa from 'execa'
import { downloadFromS3 } from './downloadFromS3'
import filesize from 'filesize'
import { Interleaver } from './Interleaver'
import chalk from 'chalk'
import { HeadObjectOutput } from 'aws-sdk/clients/s3'
import { writeTar, extractTar } from './tarUtils'

export const getExistsInLocalCache = async (
  key: string,
  cacheFolder: string,
): Promise<Stats | false> => {
  try {
    const stats = await fs.stat(path.join(cacheFolder, key))
    return stats
  } catch (e) {
    return false
  }
}

export const getExistsInRemoteCache = async ({
  key,
  awsBucket,
  s3,
}: {
  key: string
  awsBucket: string
  s3: AWS.S3
}): Promise<HeadObjectOutput | false> => {
  try {
    const headObject = await s3
      .headObject({
        Bucket: awsBucket,
        Key: key,
      })
      .promise()
    return headObject
  } catch (e) {
    return false
  }
}

export const readFromRemoteCache = async ({
  key,
  writer,
  awsBucket,
  cacheFolder,
  s3,
}: {
  key: string
  writer: PackageWriter
  awsBucket: string
  cacheFolder: string
  s3: AWS.S3
}) => {
  const info = await getExistsInRemoteCache({ key, awsBucket, s3 })
  if (!info) throw new Error('Does not exists in remote cache.')
  const size = filesize(info.ContentLength || 0)
  writer.log(`Download (${size})`)
  const start = Date.now()
  await downloadFromS3({ key, to: path.join(cacheFolder, key), awsBucket, s3 })
  writer.log(`Download completed (${size}) in ${Date.now() - start}ms`)
}

export const readFromLocalCache = async ({
  key,
  to,
  writer,
  cacheFolder,
}: {
  key: string
  to: string
  writer: PackageWriter
  cacheFolder: string
}) => {
  writer.log('Extract')
  const start = Date.now()
  await extractTar({
    from: path.join(cacheFolder, key),
    to: to,
  })
  writer.log(`Extracted in ${Date.now() - start}ms`)
}

const writePackageToLocalCache = async (
  info: PackageInfo,
  root: string,
  cacheFolder: string,
): Promise<void> => {
  const { hash, location } = info
  const cwd = path.join(root, location)

  // It's not on S3, time to tar it and upload.
  const untracked = execa.sync('git', ['ls-files', '-o'], { cwd }).stdout
  const untrackedArray = untracked
    .split('\n')
    .filter((v) => !v.startsWith('node_modules') && !v.startsWith('.'))

  if (untrackedArray.length === 0) {
    // An empty file.
    await fs.createFile(path.join(cacheFolder, hash))
  } else {
    await writeTar({
      entries: untrackedArray,
      cwd,
      path: path.join(cacheFolder, hash),
    })
  }
}

export const writeToRemoteCache = async ({
  key,
  writer,
  awsBucket,
  cacheFolder,
  s3,
}: {
  key: string
  writer: PackageWriter
  cacheFolder: string
  awsBucket: string
  s3: AWS.S3
}): Promise<void> => {
  const filePath = path.join(cacheFolder, key)
  const size = fs.statSync(filePath).size
  const sizeString = filesize(size, { unix: true })
  const body = await fs.readFile(filePath)
  writer.log(`Upload (${sizeString})`)
  const start = Date.now()
  await s3
    .upload({
      Bucket: awsBucket,
      Key: key,
      Body: body,
    })
    .promise()
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

const hr = () => console.log('-'.repeat(process.stdout.columns))

export const syncPackages = async ({
  globalHash,
  root,
  cacheFolder,
  awsBucket,
  s3,
}: {
  globalHash: string
  root: string
  cacheFolder: string
  awsBucket: string
  s3: AWS.S3
}): Promise<void> => {
  hr()
  const cachedPackages: { [key: string]: boolean } = {}
  const packageHashes = await getPackageHashes({ globalHash, root })
  const packageHashesValues = Object.values(packageHashes).filter(
    (info) => info.hasBuildStep,
  )
  Interleaver.setStdOut(process.stdout)

  console.log('Download Packages')
  const downloadStart = Date.now()
  const downloadWriters = getWriters(packageHashes)
  await Promise.all(
    packageHashesValues.map(async (info) => {
      const writer = downloadWriters[info.name]
      writer.log(info.hash)
      const existsLocally = await getExistsInLocalCache(info.hash, cacheFolder)
      if (existsLocally) {
        writer.log('Local Cache Hit')
        await readFromLocalCache({
          key: info.hash,
          to: path.join(root, info.location),
          writer,
          cacheFolder,
        })
        cachedPackages[info.name] = true
        writer.close()
        return
      }

      const existsRemotely = await getExistsInRemoteCache({
        key: info.hash,
        awsBucket,
        s3,
      })
      if (existsRemotely) {
        writer.log('Remote Cache Hit')
        await readFromRemoteCache({
          key: info.hash,
          writer,
          awsBucket,
          cacheFolder,
          s3,
        })
        await readFromLocalCache({
          key: info.hash,
          to: path.join(root, info.location),
          writer,
          cacheFolder,
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
  console.log(`Downloaded packages in ${Date.now() - downloadStart}ms`)

  hr()

  console.log('Build')
  const buildStart = Date.now()
  const buildPackages = packageHashesValues
    .filter((v) => !cachedPackages[v.name])
    .map((v) => v.name)
  const scopeArgs = buildPackages.flatMap((name) => ['--scope', name])
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
  console.log(`Build completed in ${Date.now() - buildStart}ms`)

  hr()

  console.log('Upload Packages')
  const uploadStart = Date.now()
  const uploadWriters = getWriters(packageHashes)
  await Promise.all(
    packageHashesValues.map(async (info) => {
      if (cachedPackages[info.name]) {
        return
      }
      const writer = uploadWriters[info.name]
      await writePackageToLocalCache(info, root, cacheFolder)
      await writeToRemoteCache({
        key: info.hash,
        writer,
        cacheFolder,
        awsBucket,
        s3,
      })
      writer.close()
    }),
  )
  Interleaver.reset()
  console.log(`Upload packages completed in ${Date.now() - uploadStart}ms`)
}
