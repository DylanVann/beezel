import { getGitHashForFiles } from '@rushstack/package-deps-hash'
import objectHash from 'object-hash'

// Key for yarn.lock
export const getYarnHash = async ({
  globalHash,
  root,
}: {
  globalHash: string
  root: string
}): Promise<string> => {
  const hashMap = getGitHashForFiles(['yarn.lock'], root)
  return `yarn-${objectHash([hashMap, globalHash])}.tgz`
}
