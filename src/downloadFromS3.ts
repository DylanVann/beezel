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
  const file = fs.createWriteStream(to)
  return new Promise((resolve, reject) => {
    const onError = async () => {
      await fs.unlink(to)
      reject()
    }
    S3.getObject({
      Bucket: env.BEEZEL_AWS_BUCKET,
      Key: key,
    })
      .on('error', onError)
      .on('httpError', onError)
      .on('httpData', (chunk: any) => file.write(chunk))
      .on('httpDone', () => {
        file.end()
        resolve()
      })
      .send()
  })
}
