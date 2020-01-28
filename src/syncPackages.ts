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

const getExistsInLocalCache = ({ filePath }: PackageInfo): boolean => {
  return fs.existsSync(filePath)
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
  console.time(`${name} - Download ${fileName}`)
  await downloadFromS3({ key: fileName, to: filePath })
  console.timeEnd(`${name} - Download ${fileName}`)
}

const extractPackage = async ({
  name,
  filePath,
  fileName,
  location,
}: PackageInfo) => {
  console.time(`${name} - Extract ${fileName}`)
  await extractTar({
    from: filePath,
    to: path.join(root, location),
  })
  console.timeEnd(`${name} - Extract ${fileName}`)
}

const getPackage = async (
  info: PackageInfo,
): Promise<{ isCached: boolean }> => {
  const { name } = info

  const existsLocally = getExistsInLocalCache(info)
  if (existsLocally) {
    console.log(`${name} - Locally Cached`)
    await extractPackage(info)
    return { isCached: true }
  }

  const existsRemotely = await getExistsInRemoteCache(info)
  if (existsRemotely) {
    await getPackageFromRemoteCache(info)
    await extractPackage(info)
    return { isCached: true }
  }

  // It's not in our local cache or in the remote cache, so must be build.
  // Actually some packages may just not have a build command.
  // In that case nothing will be uploaded to S3.
  // eslint-disable-next-line no-console
  console.log(`${name} - Not Cached`)
  return { isCached: false }
}

const uploadPackage = async (info: PackageInfo) => {
  const { name, fileName, filePath, location } = info
  const cwd = path.join(root, location)

  const existsInRemoteCache = await getExistsInRemoteCache(info)
  if (existsInRemoteCache) {
    console.log(`${name} - Already Uploaded`)
    return
  }

  // It's not on S3, time to tar it and upload.
  const untracked = execa.sync("git", ["ls-files", "-o"], { cwd }).stdout
  const untrackedArray = untracked
    .split("\n")
    .filter(v => !v.startsWith("node_modules") && !v.startsWith("."))

  if (!untrackedArray.length) {
    console.log(`${name} - Has No Files`)
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

  console.log(`${name} - Upload ${fileName} (${sizeString})`)
  console.time(`${name} - Upload ${fileName} (${sizeString})`)
  await S3.upload({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: body,
  }).promise()
  console.timeEnd(`${name} - Upload ${fileName} (${sizeString})`)
}

export const syncPackages = async (): Promise<void> => {
  const cachedPackages: string[] = []

  const packageHashes = await getPackageHashes()
  const packageHashesValues = Object.values(packageHashes)

  console.log("-----------------------------------")
  console.time("Download Packages")
  for (const info of packageHashesValues) {
    const { isCached } = await getPackage(info)
    if (isCached) {
      cachedPackages.push(info.name)
    }
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
