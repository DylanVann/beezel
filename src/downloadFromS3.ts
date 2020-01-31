import fs from 'fs-extra'
import { S3 } from './s3Client'
import { env } from './env'

export const downloadFromS3 = ({
  key,
  to,
}: {
  key: string
  to: string
}): Promise<void> => {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(to)
    const s3Stream = S3.getObject({
      Bucket: env.BEEZEL_AWS_BUCKET,
      Key: key,
    }).createReadStream()
    s3Stream.on('error', e => {
      fileStream.destroy()
      reject(e)
    })
    fileStream.on('error', e => {
      s3Stream.destroy()
      reject(e)
    })
    fileStream.on('close', resolve)
    s3Stream.pipe(fileStream)
  })
}
