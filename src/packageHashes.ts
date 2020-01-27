import path from "path"
import { getPackageDeps } from "@microsoft/package-deps-hash"
import fs from "fs-extra"
import objectHash from "object-hash"
import execa from "execa"
import { globalHash } from "./globalHash"
import { root } from "./paths"

// We need a list of packages in topological order.
// This is because we need to compute hashes for dependencies before dependents.
// Then the hash of a dependent can take into account the hash of its dependencies.
//
// e.g. ui depends on utils. If the hash of utils changes the hash of ui should change.
//
// External dependency changes trigger version and yarn.lock file changes, which are accounted
// for, so they are not relevant to this.
const packagesJson = execa.sync(
  "lerna",
  ["ls", "--all", "--toposort", "--json"],
  { preferLocal: true },
).stdout

const packageInfos: { location: string; name: string }[] = JSON.parse(
  packagesJson,
)

interface PackageInfo {
  location: string
  hash: string
  slug: string
  name: string
  fileName: string
}

export const packageHashes: { [key: string]: PackageInfo } = {}

packageInfos.forEach(packageInfo => {
  const cwd = path.relative(root, packageInfo.location)
  const hashObject = getPackageDeps(cwd)
  // Hash of just the files in this package.
  // We still need to take into account the global hash, and hashes of dependencies.
  const hashOfFiles = objectHash(hashObject)
  const pkgJson = fs.readJsonSync(path.join(cwd, "package.json"))
  const depsHashes = Object.keys({
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
  })
    .filter(
      name =>
        name.startsWith("@activeviam") ||
        name === "eslint-config-activeui" ||
        name === "eslint-plugin-activeui",
    )
    // Since we're doing this in topological order
    // There should be a hash calculated already for dependencies.
    .map(depName => packageHashes[depName])
  const hash = objectHash([hashOfFiles, depsHashes, globalHash])
  const slug = path.relative(path.join(root, "packages"), cwd)
  packageHashes[packageInfo.name] = {
    location: cwd,
    hash,
    slug,
    fileName: `${slug}-${hash}.tar`,
    name: packageInfo.name,
  }
})
