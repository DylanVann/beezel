import { getGitHashForFiles } from "@microsoft/package-deps-hash"
import objectHash from "object-hash"
import { root } from "paths"

const hashMap = getGitHashForFiles(
  [
    ".eslintignore",
    ".eslintrc.js",
    ".gitattributes",
    ".htmlhintrc",
    ".prettierignore",
    ".yarnrc",
    "babel.config.js",
    "jest.config.js",
    "jest.config.setupFiles.js",
    "jest.config.unit.js",
    "lerna.json",
    "package.json",
    "prettier.config.js",
    "tsconfig.base.json",
    "tsconfig.base.strict.json",
    "tsconfig.base.test.json",
    "tsconfig.json",
    "yarn.lock",
  ],
  root,
)

// If this changes we do a full rebuild.
// It should include any global dependencies.
export const globalHash = objectHash(hashMap)
