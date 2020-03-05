import path from 'path'
import { root } from './paths'
import { env } from './env'

export const cacheDir = env.BEEZEL_CACHE_FOLDER.startsWith('.')
  ? path.join(root, env.BEEZEL_CACHE_FOLDER)
  : env.BEEZEL_CACHE_FOLDER
