import path from "path"
import { getPackageDeps } from "@microsoft/package-deps-hash"
import fs from "fs-extra"
import objectHash from "object-hash"
import execa from "execa"
import { getGlobalHash } from "./getGlobalHash"
import { root, cacheDir } from "./paths"
import { env } from "env"

export interface PackageInfo {
  location: string
  name: string
  fileName: string
  filePath: string
  hasBuildStep: boolean
}

type InfoMap = { [key: string]: PackageInfo }

export const getPackageHashes = async (): Promise<InfoMap> => {
  const globalHash = await getGlobalHash()
  // We need a list of packages in topological order.
  // This is because we need to compute hashes for dependencies before dependents.
  // Then the hash of a dependent can take into account the hash of its dependencies.
  //
  // e.g. ui depends on utils. If the hash of utils changes the hash of ui should change.
  //
  // External dependency changes trigger version and yarn.lock file changes, which are accounted
  // for, so they are not relevant to this.
  const { stdout: packagesJson } = await execa(
    "lerna",
    ["ls", "--all", "--toposort", "--json"],
    { preferLocal: true, cwd: root },
  )

  const packageInfos: { location: string; name: string }[] = JSON.parse(
    packagesJson,
  )

  const packageHashes: InfoMap = {}

  // We cannot do this in parallel.
  for (const packageInfo of packageInfos) {
    const cwd = path.relative(root, packageInfo.location)
    const hashObject = getPackageDeps(cwd)
    // Hash of just the files in this package.
    // We still need to take into account the global hash, and hashes of dependencies.
    const hashOfFiles = objectHash(hashObject)
    const pkgJson = await fs.readJson(path.join(cwd, "package.json"))
    const depsHashes = Object.keys({
      ...pkgJson.dependencies,
      ...pkgJson.devDependencies,
    })
      // Since we're doing this in topological order
      // There should be a hash calculated already for internal dependencies.
      .filter(name => packageHashes[name])
      .map(name => packageHashes[name].fileName)
    const hash = objectHash([hashOfFiles, depsHashes, globalHash])
    // Slugify scoped package names.
    const slug = packageInfo.name.replace("@", "").replace("/", "__")
    const fileName = `${slug}-${hash}-${env.BEEZEL_CACHE_KEY}.tar`
    const filePath = path.join(cacheDir, fileName)
    packageHashes[packageInfo.name] = {
      location: cwd,
      fileName,
      filePath,
      hasBuildStep: pkgJson.scripts && pkgJson.scripts.build,
      name: packageInfo.name,
    }
  }

  return packageHashes
}
