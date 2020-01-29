import { getGitHashForFiles } from "@microsoft/package-deps-hash"
import objectHash from "object-hash"
import { root } from "paths"
import { getConfig } from "getConfig"

// If this changes we do a full rebuild.
// It should include any global dependencies.
export const getGlobalHash = async () => {
  const configResult = await getConfig()
  const globalDependencies = configResult.globalDependencies || []
  const hashMap = getGitHashForFiles(
    [...new Set([...globalDependencies, "yarn.lock"])],
    root,
  )
  objectHash(hashMap)
}
