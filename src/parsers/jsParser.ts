import { removeFlowTypes } from 'flow-remove-types';
import { Context } from './../index';
import { FileStats, resolveImport } from '../traverse';
import { extname, dirname } from 'path';
import * as fs from '../fs';
import {
  AST_NODE_TYPES,
  parse as parseEstree,
  TSESTree,
} from '@typescript-eslint/typescript-estree';
import Traverser from 'eslint/lib/shared/traverser';
import {
  Identifier,
  Literal,
} from '@typescript-eslint/typescript-estree/dist/ts-estree/ts-estree';

async function parseJsFile(path: string, context: Context): Promise<FileStats> {
  const stats: FileStats = {
    path,
    extname: extname(path),
    dirname: dirname(path),
    imports: [],
  };

  // this jsx check isn't bullet proof, but I have no idea how we can deal with
  // this better. The parser will fail on generics like <T> in jsx files, if we
  // don't specify those as being jsx.
  let code = await fs.readText(path);

  // removeFlowTypes checks for pragma's, use app arguments to override and
  // strip flow annotations from all files, regardless if it contains the pragma
  code = removeFlowTypes(code, { all: context.flow });

  const ast = parseEstree(code, {
    comment: false,
    jsx: stats.extname !== '.ts',
  });

  Traverser.traverse(ast, {
    enter(node: TSESTree.Node) {
      let target;

      switch (node.type) {
        // import x from './x';
        case AST_NODE_TYPES.ImportDeclaration:
          if (!node.source || !(node.source as Literal).value) {
            break;
          }
          target = (node.source as Literal).value as string;
          break;

        // export { x } from './x';
        case AST_NODE_TYPES.ExportNamedDeclaration:
          if (!node.source || !(node.source as Literal).value) {
            break;
          }
          target = (node.source as Literal).value as string;
          break;

        // export * from './x';
        case AST_NODE_TYPES.ExportAllDeclaration:
          if (!node.source) {
            break;
          }

          target = (node.source as Literal).value as string;
          break;

        // import('.x') || require('./x') || await import('.x') || await require('./x')
        case AST_NODE_TYPES.CallExpression: {
          if (
            node.callee.type !== 'Import' &&
            (node.callee as Identifier)?.name !== 'require'
          ) {
            break;
          }
          target = (node.arguments[0] as Literal).value;
          break;
        }
      }

      if (target) {
        const resolved = resolveImport(target, stats.dirname, context);
        stats.imports.push(resolved);
      }
    },
  });

  return stats;
}

export default parseJsFile;
