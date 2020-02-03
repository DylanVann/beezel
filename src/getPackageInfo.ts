import execa from 'execa'
import { root } from './paths'

/**
 * We need a list of packages in topological order.
 * This is because we need to compute hashes for dependencies before dependents.
 * Then the hash of a dependent can take into account the hash of its dependencies.
 *
 * e.g. ui depends on utils. If the hash of utils changes the hash of ui should change.
 *
 * External dependency changes trigger version and yarn.lock file changes, which are accounted
 * for, so they are not relevant to this.
 */
export const getPackageInfo = async (): Promise<{
  location: string
  name: string
}[]> => {
  const { stdout } = await execa(
    'lerna',
    ['ls', '--all', '--toposort', '--json'],
    { preferLocal: true, cwd: root },
  )
  return JSON.parse(stdout)
}
