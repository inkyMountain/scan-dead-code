import { TraverseResult } from './traverse';
import { Context } from './index';

export interface ProcessedResult {
  unresolved: string[];
  unimported: string[];
  unused: string[];
  clean: boolean;
}

function index(array: string[]): { [key: string]: boolean; } {
  return array.reduce((acc, str) => {
    acc[str] = true;
    return acc;
  }, {});
}

export async function processResults(
  files: string[],
  traverseResult: TraverseResult,
  context: Context,
): Promise<ProcessedResult> {
  const ignoreUnresolvedIndex = index(context.config.ignoreUnresolved);
  const ignoreUnusedIndex = index(context.config.ignoreUnused);
  const ignoreUnimportedIndex = index(context.config.ignoreUnimported);

  const unresolved = Array.from(traverseResult.unresolved).filter(
    (x) => !ignoreUnresolvedIndex[x],
  );

  const unused = Object.keys(context.dependencies).filter(
    (x) =>
      !traverseResult.modules.has(x) &&
      !context.peerDependencies[x] &&
      !ignoreUnusedIndex[x],
  );

  // 取 files 中 traverseResult.codeFiles 的补集，并去除文件路径中的 cwd 部分。
  const unimported = files
    .filter((x) => {
      const isInCodeFiles = traverseResult.codeFiles.has(x);
      const isInStaticFiles = traverseResult.staticFiles.has(x);
      return !isInCodeFiles && !isInStaticFiles;
    })
    .map((x) => x.substr(context.cwd.length + 1))
    .filter((x) => !ignoreUnimportedIndex[x]);

  return {
    unresolved,
    unused,
    unimported,
    clean: !unresolved.length && !unused.length && !unimported.length,
  };
}
