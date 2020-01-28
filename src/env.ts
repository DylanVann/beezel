export const ID = process.env.AWS_ID
export const SECRET = process.env.AWS_SECRET
export const BUCKET_NAME: string = process.env.AWS_BUCKET as string
export const CACHE_KEY: string = process.env.CACHE_KEY || "v1"
