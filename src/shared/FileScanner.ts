import { resolve } from "node:path";
import { GitignoreFilter } from "./GitignoreFilter";
import { GlobExclusions } from "./GlobExclusions";

export type FileScanOptions = {
  readonly exclude?: readonly string[];
  readonly includeDotfiles: boolean;
  readonly includeIgnored: boolean;
};

export class FileScanner {
  static async scan(
    root: string,
    pattern: string,
    options: FileScanOptions
  ): Promise<readonly string[]> {
    const absoluteRoot = resolve(root);
    const filter = options.includeIgnored
      ? undefined
      : await GitignoreFilter.for(absoluteRoot);
    const excludes = GlobExclusions.compile(options.exclude);
    const glob = new Bun.Glob(pattern);
    const files: string[] = [];

    for await (const filePath of glob.scan({
      cwd: absoluteRoot,
      absolute: true,
      onlyFiles: true,
      dot: options.includeDotfiles,
    })) {
      if (
        (filter === undefined || !filter.ignores(filePath)) &&
        !GlobExclusions.ignores(excludes, absoluteRoot, filePath)
      ) {
        files.push(filePath);
      }
    }

    return files;
  }
}
