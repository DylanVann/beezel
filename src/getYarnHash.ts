import { getGitHashForFiles } from '@microsoft/package-deps-hash'
import objectHash from 'object-hash'
import { root } from './paths'
import memoize from 'lodash.memoize'
import { getGlobalHash } from 'getGlobalHash'

// Key for yarn.lock
export const getYarnHash = memoize(
  async (): Promise<string> => {
    const globalHash = await getGlobalHash()
    const hashMap = getGitHashForFiles(['yarn.lock'], root)
    return `yarn-${objectHash([hashMap, globalHash])}.tgz`
  },
)
