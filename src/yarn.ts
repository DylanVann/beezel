import fs from "fs"
import fg from "fast-glob"
import path from "path"
import tar from "tar-fs"
import { yarnHash } from "./yarnHash"
import { cacheDir } from "./paths"
import { extractTar } from "./extractTar"
import { S3, BUCKET_NAME } from "./s3Client"
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
  const writeStream = fs.createWriteStream(path.join(cacheDir, tarFileName))
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

export const sync = async () => {
  const exists = fs.existsSync(tarFilePath)
  const extract = () =>
    extractTar({
      from: tarFilePath,
      to: root,
    })

  if (exists) {
    console.log("yarn - locally cached")
    console.time("yarn - Extract")
    await extract()
    console.timeEnd("yarn - Extract")
    return
  }

  const isOnS3 = await getIsOnS3()
  if (isOnS3) {
    console.log("yarn - Downloading")
    await download()
  } else {
    console.log("yarn - Running")
    await runYarn()
    console.log("yarn - Uploading")
    await upload()
  }
}
