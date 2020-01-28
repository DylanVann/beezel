import fs from "fs-extra"
import fg from "fast-glob"
import path from "path"
import tar from "@dylanvann/tar-fs"
import { yarnHash } from "./yarnHash"
import { cacheDir } from "./paths"
import { extractTar } from "./extractTar"
import { S3 } from "./s3Client"
import { BUCKET_NAME, CACHE_KEY } from "./env"
import execa from "execa"
import { root } from "./paths"
import { downloadFromS3 } from "./downloadFromS3"

const tarFileName = `yarn-${yarnHash}-${CACHE_KEY}.tar`
const tarFilePath = path.join(cacheDir, tarFileName)

export const runYarn = async (): Promise<void> => {
  console.log("yarn - Run")
  console.time("yarn - Run")
  await execa("yarn", ["--frozen-lockfile"], {
    stdout: "inherit",
    preferLocal: true,
    cwd: root,
  })
  console.timeEnd("yarn - Run")
}

export const uploadYarn = async (): Promise<void> => {
  console.log("yarn - Upload")
  console.time("yarn - Upload")
  const files = await fg(
    [".cache/**/*", "node_modules/**/*", "packages/*/node_modules/**/*"],
    { cwd: root, onlyFiles: true, followSymbolicLinks: false, absolute: false },
  )
  const writeStream = fs.createWriteStream(tarFilePath)
  await new Promise((resolve, reject) =>
    tar
      .pack(root, {
        entries: files,
      })
      .pipe(writeStream)
      .on("error", reject)
      .on("close", resolve),
  )
  const body = await fs.readFile(tarFilePath)
  await S3.upload({
    Bucket: BUCKET_NAME,
    Key: tarFileName,
    Body: body,
  }).promise()
  console.timeEnd("yarn - Upload")
}

const getIsOnS3 = async (): Promise<boolean> => {
  try {
    await S3.headObject({ Bucket: BUCKET_NAME, Key: tarFileName }).promise()
    return true
  } catch (e) {
    return false
  }
}

const download = async (): Promise<void> => {
  console.log("yarn - Download")
  console.time("yarn - Download")
  await downloadFromS3({ key: tarFileName, to: tarFilePath })
  console.timeEnd("yarn - Download")
}

const extract = async () => {
  console.log("yarn - Extract")
  console.time("yarn - Extract")
  await extractTar({
    from: tarFilePath,
    to: root,
  })
  console.timeEnd("yarn - Extract")
}

export const syncYarn = async (): Promise<{ shouldUpload: boolean }> => {
  const existsLocally = fs.existsSync(tarFilePath)
  if (existsLocally) {
    console.log("yarn - Locally Cached")
    return { shouldUpload: false }
  }

  const isOnS3 = await getIsOnS3()
  if (isOnS3) {
    await download()
    await extract()
  }

  await runYarn()
  return { shouldUpload: !isOnS3 }
}
