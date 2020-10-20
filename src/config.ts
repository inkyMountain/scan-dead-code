import { ProcessedResult } from './process';
import { readJson, writeJson } from './fs';
import { Context } from './index';

export interface UnimportedConfig {
  flow?: boolean;
  entry?: string[];
  extensions?: string[];
  ignorePatterns?: string[];
  ignoreUnresolved: string[];
  ignoreUnimported: string[];
  ignoreUnused: string[];
  moduleDirectory?: string[];
}

export async function getConfig(): Promise<UnimportedConfig> {
  const json: Partial<UnimportedConfig> =
    (await readJson('.unimportedrc.json')) || {};

  return Object.assign<UnimportedConfig, Partial<UnimportedConfig>>(
    {
      ignoreUnresolved: [],
      ignoreUnimported: [],
      ignoreUnused: [],
    },
    json,
  );
}


export async function writeConfig(
  config: Partial<UnimportedConfig>,
  context: Context,
) {
  const cfg = Object.assign({}, context.config, config);
  await writeJson('.unimportedrc.json', cfg);
}
