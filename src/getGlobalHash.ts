import { getGitHashForFiles } from '@microsoft/package-deps-hash'
import objectHash from 'object-hash'
import { env } from './env'
import { getConfig } from './getConfig'
import { root } from './paths'
import memoize from 'lodash.memoize'

// If this changes we do a full rebuild.
// It should include any global dependencies.
export const getGlobalHash = memoize(
  async (): Promise<string> => {
    const configResult = await getConfig()
    const globalDependencies = configResult.globalDependencies || []
    const deps = [...new Set([...globalDependencies, 'yarn.lock'])]
    const hashMap = getGitHashForFiles(deps, root)
    return objectHash([hashMap, env.BEEZEL_CACHE_KEY])
  },
)
