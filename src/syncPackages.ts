import path from "path"
import { getPackageHashes, PackageInfo } from "./getPackageHashes"
import { S3 } from "./s3Client"
import { BUCKET_NAME } from "./env"
import fs from "fs-extra"
import execa from "execa"
import { root } from "./paths"
import { extractTar } from "./extractTar"
import { downloadFromS3 } from "./downloadFromS3"
import tar from "@dylanvann/tar-fs"
import filesize from "filesize"

const getExistsInLocalCache = async ({
  filePath,
}: PackageInfo): Promise<boolean> => {
  try {
    await fs.stat(filePath)
    return true
  } catch (e) {
    return false
  }
}

const getExistsInRemoteCache = async ({
  fileName,
}: PackageInfo): Promise<boolean> => {
  try {
    await S3.headObject({ Bucket: BUCKET_NAME, Key: fileName }).promise()
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
  console.time(`${name} - ${fileName} - Download`)
  await downloadFromS3({ key: fileName, to: filePath })
  console.timeEnd(`${name} - ${fileName} - Download`)
}

const extractPackage = async ({
  name,
  filePath,
  fileName,
  location,
}: PackageInfo) => {
  console.time(`${name} - ${fileName}- Extract`)
  await extractTar({
    from: filePath,
    to: path.join(root, location),
  })
  console.timeEnd(`${name} - ${fileName} - Extract`)
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

  if (!untrackedArray.length) {
    console.log(prefix("Has No Files"))
    return
  }

  const writeStream = fs.createWriteStream(filePath)
  await new Promise((resolve, reject) =>
    tar
      .pack(cwd, { entries: untrackedArray, dereference: true })
      .pipe(writeStream)
      .on("error", reject)
      .on("close", resolve),
  )
  const body = await fs.readFile(filePath)
  const size = fs.statSync(filePath).size
  const sizeString = filesize(size, { unix: true })

  console.log(prefix(`Upload (${sizeString})`))
  console.time(prefix(`Upload (${sizeString})`))
  await S3.upload({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: body,
  }).promise()
  console.timeEnd(prefix(`Upload (${sizeString})`))
}

export const syncPackages = async (): Promise<void> => {
  const cachedPackages: string[] = []

  const packageHashes = await getPackageHashes()
  const packageHashesValues = Object.values(packageHashes)

  console.log("-----------------------------------")
  console.time("Download Packages")
  for (const info of packageHashesValues) {
    const prefix = (message: string) =>
      `${info.name} - ${info.fileName} - ${message}`

    const existsLocally = await getExistsInLocalCache(info)
    if (existsLocally) {
      console.log(prefix(`Local Cache Hit`))
      await extractPackage(info)
      cachedPackages.push(info.name)
      return
    }

    const existsRemotely = await getExistsInRemoteCache(info)
    if (existsRemotely) {
      console.log(prefix(`Remote Cache Hit`))
      await getPackageFromRemoteCache(info)
      await extractPackage(info)
      cachedPackages.push(info.name)
      return
    }

    // It's not in our local cache or in the remote cache, so must be build.
    // Actually some packages may just not have a build command.
    // In that case nothing will be uploaded to S3.
    console.log(prefix(`Cache Miss`))
  }
  console.timeEnd("Download Packages")
  console.log("-----------------------------------")

  const ignoreStatements = cachedPackages.flatMap(name => ["--ignore", name])
  try {
    console.time("Build")
    const args = [
      "run",
      "build",
      "--stream",
      "--reject-cycles",
      ...ignoreStatements,
    ]
    console.log(`lerna ${args.join(" ")}`)
    await execa("lerna", args, {
      stdout: "inherit",
      preferLocal: true,
      cwd: root,
    })
    console.timeEnd("Build")
  } catch (e) {
    const allCached = e.stderr.includes("No packages remain after filtering")
    if (allCached) {
      // eslint-disable-next-line no-console
      console.log("Everything was cached!")
    } else {
      // eslint-disable-next-line no-console
      console.log("Error:", e)
    }
  }

  console.log("-----------------------------------")
  console.time("Upload Packages")
  for (const info of packageHashesValues) {
    await uploadPackage(info)
  }
  console.timeEnd("Upload Packages")
  console.log("-----------------------------------")
}
