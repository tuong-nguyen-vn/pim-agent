import { resolve } from "node:path";
import { FsErrors } from "../../shared/FsErrors";
import { GitignoreFilter } from "../../shared/GitignoreFilter";

export type GlobMatch = {
  readonly path: string;
  readonly mtime: number;
};

export async function findFiles(
  root: string,
  pattern: string
): Promise<readonly GlobMatch[]> {
  const metadata = await FsErrors.statOrThrow(root);

  if (!metadata.isDirectory()) {
    throw new Error(
      `Glob path must be a directory: ${root}. Drop "path" and put the filename in "pattern", or use the read tool to inspect a single file.`
    );
  }

  const absoluteRoot = resolve(root);
  const filter = await GitignoreFilter.for(absoluteRoot);
  const glob = new Bun.Glob(pattern);
  const matches: GlobMatch[] = [];

  for await (const path of glob.scan({
    cwd: absoluteRoot,
    absolute: true,
    onlyFiles: true,
    dot: false,
  })) {
    if (!filter.ignores(path)) {
      matches.push({
        path,
        mtime: Bun.file(path).lastModified,
      });
    }
  }

  return matches.sort(
    (left, right) =>
      right.mtime - left.mtime || left.path.localeCompare(right.path)
  );
}
