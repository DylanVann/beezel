import { getGitHashForFiles } from '@microsoft/package-deps-hash'
import objectHash from 'object-hash'
import { env } from './env'
import { root } from './paths'
import memoize from 'lodash.memoize'

// Key for yarn.lock
export const getYarnHash = memoize(
  async (): Promise<string> => {
    const hashMap = getGitHashForFiles(['yarn.lock'], root)
    return `yarn-${objectHash([hashMap, env.BEEZEL_CACHE_KEY])}.tgz`
  },
)
