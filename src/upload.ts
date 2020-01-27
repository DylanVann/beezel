import "loud-rejection/register"
import path from "path"
import { packageHashes } from "./packageHashes"
import execa from "execa"
import tar from "@dylanvann/tar-fs"
import { S3, BUCKET_NAME } from "./s3Client"
import fs from "fs-extra"
import { cacheDir, root } from "./paths"
import filesize from "filesize"

const run = async () => {
  await fs.ensureDir(cacheDir)
  await Promise.all(
    Object.values(packageHashes).map(async info => {
      const cwd = path.join(root, info.location)
      const { fileName, name } = info
      const filePath = path.join(cacheDir, fileName)
      // eslint-disable-next-line no-console
      console.log(`${name} - Checking`)
      // We can check if this is already on S3 now.
      try {
        // If the file is not found this will throw.
        await S3.headObject({ Bucket: BUCKET_NAME, Key: fileName }).promise()
        // eslint-disable-next-line no-console
        console.log(`${name} - Already Uploaded`)
      } catch (e) {
        // It's not on S3, time to tar it and upload.
        const untracked = execa.sync("git", ["ls-files", "-o"], { cwd }).stdout
        const untrackedArray = untracked
          .split("\n")
          .filter(v => !v.startsWith("node_modules") && !v.startsWith("."))
        if (!untrackedArray.length) {
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
        // eslint-disable-next-line no-console
        console.log(`${name} - Uploading ${fileName} (${sizeString})`)
        await S3.upload({
          Bucket: BUCKET_NAME,
          Key: fileName,
          Body: body,
        }).promise()
      }
    }),
  )
}

run()
