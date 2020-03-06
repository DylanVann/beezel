import path from 'path'
import { root } from './paths'
import { env } from './env'
import expandTilde from 'expand-tilde'

export const cacheDir = env.BEEZEL_CACHE_FOLDER.startsWith('.')
  ? path.join(root, env.BEEZEL_CACHE_FOLDER)
  : expandTilde(env.BEEZEL_CACHE_FOLDER)
