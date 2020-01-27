import { getGitHashForFiles } from "@microsoft/package-deps-hash"
import objectHash from "object-hash"
import { root } from "paths"

const hashMap = getGitHashForFiles(["yarn.lock"], root)

export const yarnHash = objectHash(hashMap)
