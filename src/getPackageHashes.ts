import path from 'path'
import { getPackageDeps } from '@rushstack/package-deps-hash'
import fs from 'fs-extra'
import objectHash from 'object-hash'
import { getPackageInfo } from './getPackageInfo'

export interface PackageInfo {
  location: string
  name: string
  hash: string
  hasBuildStep: boolean
}

export type PackageInfoMap = { [key: string]: PackageInfo }

export const getPackageHashes = async ({
  globalHash,
  root,
}: {
  globalHash: string
  root: string
}): Promise<PackageInfoMap> => {
  const packageInfos = await getPackageInfo({ root })
  const packageHashes: PackageInfoMap = {}

  // We cannot do this in parallel.
  for (const packageInfo of packageInfos) {
    const cwd = path.relative(root, packageInfo.location)
    const hashObject = getPackageDeps(cwd)
    // Hash of just the files in this package.
    // We still need to take into account the global hash, and hashes of dependencies.
    const hashOfFiles = objectHash(hashObject)
    const pkgJson = await fs.readJson(path.join(cwd, 'package.json'))
    const depsHashes = Object.keys({
      ...pkgJson.dependencies,
      ...pkgJson.devDependencies,
    })
      // Since we're doing this in topological order
      // There should be a hash calculated already for internal dependencies.
      .filter((name) => packageHashes[name])
      .map((name) => packageHashes[name].hash)
    const hash = objectHash([hashOfFiles, depsHashes, globalHash])
    // Slugify scoped package names.
    const slug = packageInfo.name.replace('@', '').replace('/', '__')
    const fileName = `${slug}-${hash}.tgz`
    packageHashes[packageInfo.name] = {
      name: packageInfo.name,
      location: cwd,
      hash: fileName,
      hasBuildStep: pkgJson.scripts && pkgJson.scripts.build,
    }
  }

  return packageHashes
}
