import fs from 'fs-extra'
import AWS from 'aws-sdk'

export const downloadFromS3 = ({
  key,
  to,
  awsBucket,
  s3,
}: {
  key: string
  to: string
  awsBucket: string
  s3: AWS.S3
}): Promise<void> => {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(to)
    const s3Stream = s3
      .getObject({
        Bucket: awsBucket,
        Key: key,
      })
      .createReadStream()
    s3Stream.on('error', (e) => {
      fileStream.destroy()
      reject(e)
    })
    fileStream.on('error', (e) => {
      s3Stream.destroy()
      reject(e)
    })
    fileStream.on('close', resolve)
    s3Stream.pipe(fileStream)
  })
}
