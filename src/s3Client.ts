import AWS from "aws-sdk"
import { ID, SECRET } from "./env"

export const S3 = new AWS.S3({
  accessKeyId: ID,
  secretAccessKey: SECRET,
})
