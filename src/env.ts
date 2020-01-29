import { config } from "dotenv"
import envalid, { str } from "envalid"
import { root } from "paths"

config({ path: root })

export const env = envalid.cleanEnv(process.env, {
  BEEZEL_AWS_ID: str({ desc: "AWS ID." }),
  BEEZEL_AWS_SECRET: str({ desc: "AWS secret." }),
  BEEZEL_AWS_BUCKET: str({ desc: "AWS S3 bucket." }),
  BEEZEL_CACHE_KEY: str({
    desc: "Global cache key. Can be used for cache busting.",
    default: "v1",
  }),
})
