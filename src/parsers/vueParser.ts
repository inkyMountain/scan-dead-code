import { FileStats } from '../traverse';
import { Context } from '../index';
import { extname, dirname } from 'path';
import * as fs from '../fs';
import pathModule from 'path';
import * as compiler from 'vue-template-compiler';

const parse:
  (path: string) => Promise<{ script: string, style: string, template: string; }> =
  async (path) => {
    const vueText = await fs.readText(path);
    console.log('compiler', compiler);
    const rootNode = compiler.parseComponent(vueText);
    console.log('rootNode', rootNode);

    return {
      script: '',
      style: '',
      template: '',
    };
  };

parse(pathModule.join(process.cwd(), 'src/testFolder/CommentDetail.vue')).then(() => {

});

const parseVueFile: (path: string, context: Context) => Promise<FileStats> = async (path, context) => {
  const fileStats: FileStats = {
    path,
    extname: extname(path),
    dirname: dirname(path),
    imports: [],
  };

  return fileStats;
};

export default parseVueFile;