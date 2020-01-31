import { getGitHashForFiles } from '@microsoft/package-deps-hash'
import objectHash from 'object-hash'
import { root } from 'paths'
import { getConfig } from './getConfig'
import { env } from 'env'

let globalHash: string | undefined

// If this changes we do a full rebuild.
// It should include any global dependencies.
export const getGlobalHash = async (): Promise<string> => {
  if (globalHash !== undefined) {
    return globalHash
  }
  const configResult = await getConfig()
  const globalDependencies = configResult.globalDependencies || []
  const deps = [...new Set([...globalDependencies, 'yarn.lock'])]
  const hashMap = getGitHashForFiles(deps, root)
  return objectHash([hashMap, env.BEEZEL_CACHE_KEY])
}
