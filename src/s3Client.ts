import AWS from "aws-sdk"
import http from "http"

const ID = process.env.AWS_ID
const SECRET = process.env.AWS_SECRET

export const BUCKET_NAME = "build-cache-23123"

AWS.config.update({
  httpOptions: {
    agent: new http.Agent({ keepAlive: true }),
  },
})

export const S3 = new AWS.S3({
  accessKeyId: ID,
  secretAccessKey: SECRET,
})
