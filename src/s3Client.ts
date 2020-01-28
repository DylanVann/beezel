import AWS from "aws-sdk"
import http from "http"
import { ID, SECRET } from "./env"

AWS.config.update({
  httpOptions: {
    agent: new http.Agent({ keepAlive: true }),
  },
})

export const S3 = new AWS.S3({
  accessKeyId: ID,
  secretAccessKey: SECRET,
})
