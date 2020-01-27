import "loud-rejection/register"
import path from "path"
import { packageHashes } from "./packageHashes"
import { S3, BUCKET_NAME } from "./s3Client"
import fs from "fs-extra"
import execa from "execa"
import { cacheDir, root } from "./paths"
import { extractTar } from "./extractTar"
import { downloadFromS3 } from "./downloadFromS3"

const run = async () => {
  // eslint-disable-next-line no-console
  console.time("Downloaded Dependencies")
  await fs.ensureDir(cacheDir)
  const cachedPackages: string[] = []
  await Promise.all(
    Object.values(packageHashes).map(async info => {
      const { fileName, name } = info
      const filePath = path.join(cacheDir, fileName)

      const extract = () =>
        extractTar({
          from: path.join(cacheDir, fileName),
          to: path.join(root, info.location),
        })

      // Does the file already exist locally?
      const exists = fs.existsSync(filePath)
      if (exists) {
        // eslint-disable-next-line no-console
        console.log(`${name} - Locally Cached`)
        await extract()
        cachedPackages.push(name)
        return
      }
      // We can check if this is already on S3 now.
      try {
        // This will throw if it's not on S3.
        await S3.headObject({ Bucket: BUCKET_NAME, Key: fileName }).promise()
        // eslint-disable-next-line no-console
        console.log(`${name} - Downloading`)
        // Download the file.
        await downloadFromS3({ key: fileName, to: filePath })
        // eslint-disable-next-line no-console
        console.log(`${name} - Downloaded`)
        // We need to extract it into the package directory now.
        await extract()
        cachedPackages.push(name)
      } catch (e) {
        // It's not on S3 :(
        // So we need to build it.
        // Actually some packages may just not have a build command.
        // In that case nothing will be uploaded to S3.
        // eslint-disable-next-line no-console
        console.log(`${name} - Not Cached`)
      }
    }),
  )

  // eslint-disable-next-line no-console
  console.timeEnd("Downloaded Dependencies")
  const ignoreStatements = cachedPackages.flatMap(name => ["--ignore", name])
  try {
    // eslint-disable-next-line no-console
    console.log(
      `lerna${[
        "run",
        "build",
        "--stream",
        "--reject-cycles",
        ...ignoreStatements,
      ].join(" ")}`,
    )
    await execa(
      "lerna",
      ["run", "build", "--stream", "--reject-cycles", ...ignoreStatements],
      { stdout: "inherit", preferLocal: true, cwd: root },
    )
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
}

run()
