import 'hard-rejection/register'
import execa from 'execa'
import fs from 'fs-extra'
import path from 'path'

const pkg = require('../package.json')
const root = path.join(__dirname, '..')

const createVersionFile = async () => {
  const content = `export const version = '${pkg.version}'\n`
  await fs.writeFile(path.join(root, 'src', 'version.ts'), content)
}

const build = async () => {
  await createVersionFile()
  await fs.remove(path.join(root, 'dist'))
  await execa('yarn', ['build:ncc'], {
    stdio: 'inherit',
    cwd: path.join(root),
  })
}

build()
