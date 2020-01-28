import fs from "fs"
import { S3 } from "./s3Client"
import { BUCKET_NAME } from "./env"

export const downloadFromS3 = ({
  key,
  to,
}: {
  key: string
  to: string
}): Promise<void> => {
  const file = fs.createWriteStream(to)
  // Attempt to download the file.
  // Will throw if it's not there.
  return new Promise((resolve, reject) =>
    S3.getObject({
      Bucket: BUCKET_NAME,
      Key: key,
    })
      .on("httpData", (chunk: any) => file.write(chunk))
      .on("httpError", (error: any) => {
        file.end()
        reject(error)
      })
      .on("httpDone", () => {
        file.end()
        resolve()
      })
      .send(),
  )
}
