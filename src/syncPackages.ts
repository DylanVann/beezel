import path from "path"
import { getPackageHashes, PackageInfo } from "./getPackageHashes"
import { S3 } from "./s3Client"
import { env } from "./env"
import fs, { Stats } from "fs-extra"
import execa from "execa"
import { root } from "./paths"
import { extractTar } from "./extractTar"
import { downloadFromS3 } from "./downloadFromS3"
import tar from "@dylanvann/tar-fs"
import filesize from "filesize"
import { Interleaver, ITaskWriter } from "./Interleaver"
import chalk from "chalk"
import { HeadObjectOutput } from "aws-sdk/clients/s3"

const getExistsInLocalCache = async ({
  filePath,
}: PackageInfo): Promise<Stats | undefined> => {
  try {
    const stats = await fs.stat(filePath)
    return stats
  } catch (e) {
    return undefined
  }
}

const existsRemoteCache: { [key: string]: HeadObjectOutput } = {}
const getExistsInRemoteCache = async (
  key: string,
): Promise<HeadObjectOutput | false> => {
  if (existsRemoteCache[key]) {
    return existsRemoteCache[key]
  }
  try {
    const headObject = await S3.headObject({
      Bucket: env.BEEZEL_AWS_BUCKET,
      Key: key,
    }).promise()
    existsRemoteCache[key] = headObject
    return headObject
  } catch (e) {
    return false
  }
}

const getPackageFromRemoteCache = async (
  { fileName, filePath }: PackageInfo,
  writer: PackageWriter,
) => {
  const info = await getExistsInRemoteCache(fileName)
  if (!info) throw new Error("Does not exists in remote cache.")
  const size = filesize(info.ContentLength || 0)
  writer.log(`Download (${size})`)
  const start = Date.now()
  await downloadFromS3({ key: fileName, to: filePath })
  writer.log(`Downloaded (${size}) in ${Date.now() - start}ms`)
}

const extractPackage = async (
  { filePath, location }: PackageInfo,
  writer: PackageWriter,
) => {
  writer.log("Extract")
  const start = Date.now()
  await extractTar({
    from: filePath,
    to: path.join(root, location),
  })
  writer.log(`Extracted in ${Date.now() - start}ms`)
}

const uploadPackage = async (info: PackageInfo, writer: PackageWriter) => {
  const { fileName, filePath, location } = info
  const cwd = path.join(root, location)

  const existsInRemoteCache = await getExistsInRemoteCache(info.fileName)
  if (existsInRemoteCache) {
    writer.log("Already Uploaded")
    return
  }

  // It's not on S3, time to tar it and upload.
  const untracked = execa.sync("git", ["ls-files", "-o"], { cwd }).stdout
  const untrackedArray = untracked
    .split("\n")
    .filter(v => !v.startsWith("node_modules") && !v.startsWith("."))

  if (untrackedArray.length === 0) {
    // An empty file.
    await fs.createFile(filePath)
  } else {
    const writeStream = fs.createWriteStream(filePath)
    await new Promise((resolve, reject) =>
      tar
        .pack(cwd, { entries: untrackedArray, dereference: true })
        .pipe(writeStream)
        .on("error", reject)
        .on("close", resolve),
    )
  }

  const body = await fs.readFile(filePath)
  const size = fs.statSync(filePath).size
  const sizeString = filesize(size, { unix: true })

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
  "cyan",
  "magenta",
  "blue",
  "yellow",
  "green",
  "red",
]
let currentColor = 0
const getNextColor = (): string =>
  colorWheel[currentColor++ % colorWheel.length]

interface PackageWriter extends ITaskWriter {
  log: (message: string) => void
}

export const syncPackages = async (): Promise<void> => {
  const cachedPackages: { [key: string]: boolean } = {}
  const packageHashes = await getPackageHashes()
  const packageHashesValues = Object.values(packageHashes).filter(
    info => info.hasBuildStep,
  )
  Interleaver.setStdOut(process.stdout)
  const writers: { [key: string]: PackageWriter } = Object.fromEntries(
    Object.entries(packageHashes).map(([key]) => {
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

  console.log("-----------------------------------")

  console.log("Download Packages")
  console.time("Download Packages")
  await Promise.all(
    packageHashesValues.map(async info => {
      const writer = writers[info.name]
      const existsLocally = await getExistsInLocalCache(info)
      if (existsLocally) {
        writer.log("Local Cache Hit")
        await extractPackage(info, writer)
        cachedPackages[info.name] = true
        writer.close()
        return
      }

      const existsRemotely = await getExistsInRemoteCache(info.fileName)
      if (existsRemotely) {
        writer.log("Remote Cache Hit")
        await getPackageFromRemoteCache(info, writer)
        await extractPackage(info, writer)
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
  console.timeEnd("Download Packages")

  console.log("-----------------------------------")

  console.log("Build")
  console.time("Build")
  const buildPackages = packageHashesValues
    .filter(v => !cachedPackages[v.name])
    .map(v => v.name)
  const scopeArgs = buildPackages.flatMap(name => ["--scope", name])
  if (buildPackages.length) {
    const args = ["run", "build", "--stream", "--reject-cycles", ...scopeArgs]
    console.log(`lerna ${args.join(" ")}`)
    await execa("lerna", args, {
      stdout: "inherit",
      preferLocal: true,
      cwd: root,
    })
  } else {
    console.log("Everything was cached!")
  }
  console.timeEnd("Build")

  console.log("-----------------------------------")

  console.log("Upload Packages")
  console.time("Upload Packages")
  await Promise.all(
    packageHashesValues.map(async info => {
      if (cachedPackages[info.name]) {
        return
      }
      const writer = writers[info.name]
      await uploadPackage(info, writer)
    }),
  )
  console.timeEnd("Upload Packages")

  console.log("-----------------------------------")
}
