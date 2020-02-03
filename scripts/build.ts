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
  await execa('yarn', ['build:ncc'], {
    stdio: 'inherit',
    cwd: path.join(root),
  })
  await fs.move(
    path.join(root, 'dist', 'index.js'),
    path.join(root, 'dist', 'beezel'),
  )
}

build()
