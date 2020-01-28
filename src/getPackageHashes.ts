import path from "path"
import { getPackageDeps } from "@microsoft/package-deps-hash"
import fs from "fs-extra"
import objectHash from "object-hash"
import execa from "execa"
import { globalHash } from "./globalHash"
import { root, cacheDir } from "./paths"

export interface PackageInfo {
  location: string
  name: string
  fileName: string
  filePath: string
}

type InfoMap = { [key: string]: PackageInfo }

export const getPackageHashes = async (): Promise<InfoMap> => {
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

  await Promise.all(
    packageInfos.map(async packageInfo => {
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
      const fileName = `${slug}-${hash}-v2.tar`
      const filePath = path.join(cacheDir, fileName)
      packageHashes[packageInfo.name] = {
        location: cwd,
        fileName,
        filePath,
        name: packageInfo.name,
      }
    }),
  )

  return packageHashes
}
