export const ID = process.env.BEEZEL_AWS_ID
export const SECRET = process.env.BEEZEL_AWS_SECRET
export const BUCKET_NAME: string = process.env.BEEZEL_AWS_BUCKET as string
export const CACHE_KEY: string = process.env.BEEZEL_CACHE_KEY || "v1"
