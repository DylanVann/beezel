import envalid, { str } from "envalid"

export const env = envalid.cleanEnv(process.env, {
  BEEZEL_AWS_ID: str({ desc: "AWS ID." }),
  BEEZEL_AWS_SECRET: str({ desc: "AWS secret." }),
  BEEZEL_AWS_S3_BUCKET_NAME: str({ desc: "AWS S3 bucket name." }),
  BEEZEL_CACHE_KEY: str({
    desc: "Global cache key. Can be used for cache busting.",
    default: "v1",
  }),
})
