import * as fs from './fs';

import { join } from 'path';
import ora from 'ora';
import { printResults } from './print';
import * as meta from './meta';
import { traverse } from './traverse';
import chalk from 'chalk';
import { readJson } from './fs';
import yargs, { Arguments } from 'yargs';
import { CompilerOptions } from 'typescript';
import { processResults } from './process';
import {
  getConfig,
  UnimportedConfig,
  writeConfig,
} from './config';

export interface TsConfig {
  compilerOptions: CompilerOptions;
}

export interface PackageJson {
  name: string;
  version: string;
  main?: string;
  source?: string;
  dependencies?: { [name: string]: string; };
  optionalDependencies?: { [name: string]: string; };
  devDependencies?: { [name: string]: string; };
  bundleDependencies?: { [name: string]: string; };
  peerDependencies?: { [name: string]: string; };
  repository?: {
    directory: string;
  };
}

export interface Context {
  version: string;
  cwd: string;
  entry: string[];
  aliases: { [key: string]: string[]; };
  ignore: string[];
  extensions: string[];
  dependencies: { [key: string]: string; };
  peerDependencies: { [key: string]: string; };
  flow?: boolean;
  config: UnimportedConfig;
  moduleDirectory: string[];
}

/* eslint-disable-next-line */
async function main(args: CliArguments) {
  const spinner = ora('initializing').start();
  const cwd = process.cwd();

  try {
    const config = await getConfig();
    args.flow = config.flow ?? args.flow;

    const [aliases, dependencies, peerDependencies] = await Promise.all([
      meta.getAliases(cwd),
      meta.getDependencies(cwd),
      meta.getPeerDependencies(cwd),
    ]);

    const packageJson = await readJson<PackageJson>(
      '../package.json',
      __dirname,
    );

    if (!packageJson) {
      throw new Error('Failed to load package.json');
    }

    const moduleDirectory = config.moduleDirectory ?? ['node_modules'];

    const defaultJavaScriptExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.vue'
    ];
    const defaultImageExtensions = [
      '.png',
      '.jpg',
      '.jpeg',
      '.svg',
      '.gif',
      '.tif',
      '.bmp'
    ];
    const defaultExtensions = [...defaultJavaScriptExtensions, ...defaultImageExtensions];

    const context: Context = {
      version: packageJson.version,
      cwd,
      aliases,
      dependencies,
      peerDependencies,
      extensions: config.extensions || [...defaultExtensions],
      ignore: [],
      entry: [],
      config,
      moduleDirectory,
      ...args,
    };

    context.ignore =
      config.ignorePatterns ||
      ([
        '**/node_modules/**',
        '**/*.stories.{js,jsx,ts,tsx}',
        '**/*.tests.{js,jsx,ts,tsx}',
        '**/*.test.{js,jsx,ts,tsx}',
        '**/*.spec.{js,jsx,ts,tsx}',
        '**/tests/**',
        '**/__tests__/**',
        '**/*.d.ts',
      ].filter(Boolean) as string[]);

    // 输出默认配置文件
    if (args.init) {
      await writeConfig({ ignorePatterns: context.ignore }, context);
      spinner.stop();
      process.exit(0);
    }

    // traverse all source files and get import data
    context.entry = config.entry || (await meta.getEntry(cwd, context));
    spinner.text = `resolving imports`;
    const traverseResult = await traverse(context.entry, context);
    traverseResult.files = new Map([...traverseResult.files].sort());

    // traverse the file system and get system data
    spinner.text = 'traverse the file system';
    // const baseUrl = (await fs.exists('src', cwd)) ? join(cwd, 'src') : cwd;
    const baseUrl = (await fs.exists('src', cwd)) ? join(cwd, 'src') : cwd;
    // 获取 src 目录下所有文件
    const files = await fs.list('**/*', baseUrl, {
      extensions: context.extensions,
      ignore: context.ignore,
    });

    spinner.text = 'process results';
    spinner.stop();

    const result = await processResults(files, traverseResult, context);

    printResults(result, context);

    // return non-zero exit code in case the result wasn't clean, to support
    // running in CI environments.
    // if (!result.clean) {
    //   process.exit(1);
    // }
  } catch (error) {
    spinner.stop();
    console.error(chalk.redBright('something unexpected happened'));
    console.error(error);
    process.exit(1);
  }
}

interface CliArguments {
  flow: boolean;
  init: boolean;
}

yargs
  .scriptName('unimported')
  .usage('$0 <cmd> [args]')
  .command(
    '*',
    'scan your project for dead files',
    (yargs) => {
      yargs.option('init', {
        alias: 'i',
        type: 'boolean',
        describe: 'dump default settings to .unimportedrc.json',
      });

      yargs.option('flow', {
        alias: 'f',
        type: 'boolean',
        describe: 'indicates if your code is annotated with flow types',
      });
    },
    function (argv: Arguments<CliArguments>) {
      return main({
        init: argv.init,
        flow: argv.flow,
      });
    },
  )
  .help().argv;
