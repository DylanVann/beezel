import fs from "fs"
import tar from "@dylanvann/tar-fs"

export const extractTar = ({
  from,
  to,
}: {
  from: string
  to: string
}): Promise<void> =>
  new Promise((resolve, reject) =>
    fs.createReadStream(from).pipe(
      tar
        .extract(to)
        .on("error", reject)
        .on("finish", resolve),
    ),
  )
