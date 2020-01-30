import AWS from 'aws-sdk'
import { env } from './env'

export const S3 = new AWS.S3({
  credentials: {
    accessKeyId: env.BEEZEL_AWS_ID,
    secretAccessKey: env.BEEZEL_AWS_SECRET,
  },
})
