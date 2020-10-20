import { extname, normalize as normalizePath } from 'path';
import { Context } from './index';

import resolve from 'resolve';
import chalk from 'chalk';
import { codeExtensions } from './const';
import parseVueFile from './parsers/vueParser';
import parseJsFile from './parsers/jsParser';

export interface FileStats {
  path: string;
  extname: string;
  dirname: string;
  imports: ResolvedResult[];
}

export interface TraverseResult {
  unresolved: Set<string>;
  codeFiles: Map<string, FileStats>;
  modules: Set<string>;
  staticFiles: Set<string>;
}

function getDependencyName(path: string, context: Context): string | null {
  const [namespace, module] = path.split('/');
  const name = path[0] === '@' ? `${namespace}/${module}` : namespace;

  if (context.dependencies[name]) {
    return name;
  }

  if (context.dependencies[`@types/${name}`]) {
    return `@types/${name}`;
  }

  return null;
}

export type ResolvedResult =
  | {
    type: 'node_module';
    name: string;
    path: string;
  }
  | {
    type: 'source_file';
    path: string;
  }
  | {
    type: 'static_file';
    path: string;
  }
  | {
    type: 'unresolved';
    path: string;
  };

export function resolveImport(
  path: string,
  cwd: string,
  context: Context,
): ResolvedResult {
  const dependencyName = getDependencyName(path, context);

  if (dependencyName) {
    return {
      type: 'node_module',
      name: dependencyName,
      path: normalizePath(path),
    };
  }

  try {
    return {
      type: 'source_file',
      path: normalizePath(
        resolve
          .sync(path, {
            basedir: cwd,
            extensions: context.extensions,
            moduleDirectory: context.moduleDirectory,
          })
          .replace(/\\/g, '/')
      )
    };
  } catch (e) { }

  const staticFileExtensions = context.extensions.filter(extension => !codeExtensions.includes(extension));

  const aliases = Object.keys(context.aliases).filter((alias) =>
    path.startsWith(alias),
  );

  for (const alias of aliases) {
    for (const alt of context.aliases[alias]) {
      try {
        return {
          type: staticFileExtensions.includes(extname(path)) ? 'static_file' : 'source_file',
          path: normalizePath(
            resolve
              .sync(path.replace(alias, alt), {
                basedir: cwd,
                extensions: context.extensions,
                moduleDirectory: context.moduleDirectory,
              })
              .replace(/\\/g, '/')
          )
        };
      } catch (e) { }
    }
  }

  // last attempt, try prefix the path with ./, `import 'index' to `import './index'`
  // can be useful for the entry files
  try {
    return {
      type: 'source_file',
      path: normalizePath(
        resolve
          .sync(`./${path}`, {
            basedir: cwd,
            extensions: context.extensions,
            moduleDirectory: context.moduleDirectory,
          })
          .replace(/\\/g, '/')
      )
    };
  } catch (e) { }

  // if nothing else works out :(
  return {
    type: 'unresolved',
    path: path,
  };
}

const getResultObject: () => TraverseResult = () => ({
  unresolved: new Set<string>(),
  modules: new Set<string>(),
  codeFiles: new Map<string, FileStats>(),
  staticFiles: new Set<string>(),
});

export async function traverse(
  path: string | string[],
  context: Context,
  result = getResultObject(),
): Promise<TraverseResult> {
  if (Array.isArray(path)) {
    await Promise.all(path.map((x) => traverse(x, context, result)));
    return result;
  }

  // be sure to only process each file once, and not end up in recursion troubles
  if (result.codeFiles.has(path)) {
    return result;
  }

  // only process code files, no json or css
  if (!context.extensions.includes(extname(path))) {
    return result;
  }

  let importInfo;
  try {
    // 如果不是代码文件，则不使用 parser 进行转换。
    const isCodeFile = codeExtensions.reduce((result, extension, index, extensions) => {
      return result || extensions.includes(extname(path));
    }, false);

    if (isCodeFile) {
      // 根据文件后缀调用对应转换方法:
      // .vue -> parseVueFile
      // .js .jsx .ts .tsx -> parseJsFile
      importInfo = extname(path) === '.vue'
        ? await parseVueFile(path, context)
        : await parseJsFile(path, context);
      result.codeFiles.set(path, importInfo);
    } else {
      result.staticFiles.add(path);
    }
  } catch (e) {
    console.log(chalk.redBright(`\nFailed parsing ${path}`));
    console.log(e);
    process.exit(1);
  }

  // 只有代码文件可以经过 parse 处理，得到 importInfo 对象，
  // 并且需要对 imoprtInfo 中的路径进行递归。
  // 图片文件没有这个过程。
  if (importInfo?.imports) {
    for (const file of importInfo.imports) {
      switch (file.type) {
        case 'node_module':
          result.modules.add(file.name);
          break;
        case 'unresolved':
          result.unresolved.add(file.path);
          break;
        case 'source_file':
          if (result.codeFiles.has(file.path)) {
            break;
          }
          await traverse(file.path, context, result);
          break;
      }
    }
  }


  return result;
}
