import fs from 'fs'
import tarFs from '@dylanvann/tar-fs'

export const extractTar = ({
  from,
  to,
}: {
  from: string
  to: string
}): Promise<void> =>
  new Promise((resolve, reject) =>
    fs.createReadStream(from).pipe(
      tarFs
        .extract(to)
        .on('error', reject)
        .on('finish', resolve),
    ),
  )

export const writeTar = ({
  path,
  cwd,
  entries,
  dereference = true,
}: {
  path: string
  entries: string[]
  cwd: string
  dereference?: boolean
}) =>
  new Promise((resolve, reject) =>
    tarFs
      .pack(cwd, { entries, dereference })
      .pipe(fs.createWriteStream(path))
      .on('error', reject)
      .on('close', resolve),
  )
