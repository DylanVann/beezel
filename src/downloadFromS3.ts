import fs from "fs"
import { S3 } from "./s3Client"
import { env } from "./env"

export const downloadFromS3 = ({
  key,
  to,
}: {
  key: string
  to: string
}): Promise<void> => {
  const file = fs.createWriteStream(to)
  return new Promise((resolve, reject) =>
    S3.getObject({
      Bucket: env.BEEZEL_AWS_S3_BUCKET_NAME,
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
