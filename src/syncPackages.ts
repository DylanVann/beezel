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

const getExistsInRemoteCache = async ({
  fileName,
}: PackageInfo): Promise<boolean> => {
  try {
    await S3.headObject({
      Bucket: env.BEEZEL_AWS_BUCKET,
      Key: fileName,
    }).promise()
    return true
  } catch (e) {
    return false
  }
}

const getPackageFromRemoteCache = async ({
  name,
  fileName,
  filePath,
}: PackageInfo) => {
  const message = `${name} - ${fileName} - Download`
  console.time(message)
  await downloadFromS3({ key: fileName, to: filePath })
  console.timeEnd(message)
}

const extractPackage = async ({
  name,
  filePath,
  fileName,
  location,
}: PackageInfo) => {
  const message = `${name} - ${fileName} - Extract`
  console.time(message)
  await extractTar({
    from: filePath,
    to: path.join(root, location),
  })
  console.timeEnd(message)
}

const uploadPackage = async (info: PackageInfo) => {
  const { name, fileName, filePath, location } = info
  const cwd = path.join(root, location)
  const prefix = (message: string) => `${name} - ${fileName} - ${message}`

  const existsInRemoteCache = await getExistsInRemoteCache(info)
  if (existsInRemoteCache) {
    console.log(prefix("Already Uploaded"))
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

  const message = prefix(`Upload (${sizeString})`)
  console.log(message)
  console.time(message)
  await S3.upload({
    Bucket: env.BEEZEL_AWS_BUCKET,
    Key: fileName,
    Body: body,
  }).promise()
  console.timeEnd(message)
}

export const syncPackages = async (): Promise<void> => {
  const cachedPackages: { [key: string]: boolean } = {}
  const packageHashes = await getPackageHashes()
  const packageHashesValues = Object.values(packageHashes).filter(
    info => info.hasBuildStep,
  )

  console.log("-----------------------------------")

  console.log("Download Packages")
  console.time("Download Packages")
  for (const info of packageHashesValues) {
    const prefix = (message: string) =>
      `${info.name} - ${info.fileName} - ${message}`

    const existsLocally = await getExistsInLocalCache(info)
    if (existsLocally) {
      console.log(prefix(`Local Cache Hit`))
      await extractPackage(info)
      cachedPackages[info.name] = true
      continue
    }

    const existsRemotely = await getExistsInRemoteCache(info)
    if (existsRemotely) {
      console.log(prefix(`Remote Cache Hit`))
      await getPackageFromRemoteCache(info)
      await extractPackage(info)
      cachedPackages[info.name] = true
      continue
    }

    // It's not in our local cache or in the remote cache, so must be build.
    // Actually some packages may just not have a build command.
    // In that case nothing will be uploaded to S3.
    console.log(prefix(`Cache Miss`))
  }
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
  for (const info of packageHashesValues) {
    if (cachedPackages[info.name]) {
      continue
    }
    await uploadPackage(info)
  }
  console.timeEnd("Upload Packages")

  console.log("-----------------------------------")
}
