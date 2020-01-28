import fs from "fs-extra"
import fg from "fast-glob"
import path from "path"
import tar from "@dylanvann/tar-fs"
import { yarnHash } from "./yarnHash"
import { cacheDir } from "./paths"
import { extractTar } from "./extractTar"
import { S3 } from "./s3Client"
import { BUCKET_NAME } from "./env"
import execa from "execa"
import { root } from "./paths"
import { downloadFromS3 } from "./downloadFromS3"

const tarFileName = `yarn-${yarnHash}.tar`
const tarFilePath = path.join(cacheDir, tarFileName)

const runYarn = async (): Promise<void> => {
  await execa("yarn", { stdout: "inherit", preferLocal: true, cwd: root })
}

const upload = async (): Promise<void> => {
  const files = await fg(
    ["./node_modules/**/*", "./packages/node_modules/**/*"],
    { cwd: root, onlyFiles: true },
  )
  const writeStream = fs.createWriteStream(tarFilePath)
  return new Promise((resolve, reject) =>
    tar
      .pack(root, {
        entries: files,
      })
      .pipe(writeStream)
      .on("error", reject)
      .on("close", resolve),
  )
}

const getIsOnS3 = async (): Promise<boolean> => {
  try {
    // This will throw if it's not on S3.
    await S3.headObject({ Bucket: BUCKET_NAME, Key: tarFileName }).promise()
    return true
  } catch (e) {
    return false
  }
}

const download = async (): Promise<void> => {
  await downloadFromS3({ key: tarFileName, to: tarFilePath })
}

const extract = async () => {
  console.time("yarn - Extract")
  console.time("yarn - Extract")
  await extractTar({
    from: tarFilePath,
    to: root,
  })
  console.timeEnd("yarn - Extract")
}

export const syncYarn = async () => {
  const existsLocally = fs.existsSync(tarFilePath)
  if (existsLocally) {
    console.log("yarn - Locally Cached")
    return
  }

  const isOnS3 = await getIsOnS3()
  if (isOnS3) {
    console.log("yarn - Download")
    console.time("yarn - Download")
    await download()
    console.timeEnd("yarn - Download")
    await extract()
  } else {
    console.log("yarn - Run")
    console.time("yarn - Run")
    await runYarn()
    console.timeEnd("yarn - Run")

    console.log("yarn - Upload")
    console.time("yarn - Upload")
    await upload()
    console.timeEnd("yarn - Upload")
  }
}
