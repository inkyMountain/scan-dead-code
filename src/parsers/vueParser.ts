import { FileStats } from '../traverse';
import { Context } from '../index';
import { extname, dirname } from 'path';
import * as fs from '../fs';
import pathModule from 'path';
import * as vueCompiler from 'vue-template-compiler';
import sass, { Importer } from 'sass';
import less from 'less';

// SFC: Vue single file component
// 将目标 .vue 文件转换成 template styles script 三个部分。
const parseSFCFileToString: (
  path: string,
) => Promise<{
  script: string;
  styles: Array<string>;
  template: string;
}> = async (path) => {
  const vueFileText = await fs.readText(path);
  const rootNode = vueCompiler.parseComponent(vueFileText);
  const { script, styles, template } = rootNode;

  const compiledStyles = await Promise.all(
    styles.map(async (style) => {
      const { content, lang } = style;
      const compileMethodMapper = {
        scss: compileScss,
        sass: compileScss,
        less: compileLess,
      };
      const defaultCssCompiler = (css: string) => css;
      const compileMethod =
        compileMethodMapper[lang as 'scss' | 'sass' | 'less'] ||
        defaultCssCompiler;
      let cssText = '';
      try {
        cssText = await compileMethod(content, path);
      } catch (error) {}
      return cssText;
    }),
  );

  return {
    script: script?.content || '',
    styles: compiledStyles,
    template: template?.content || '',
  };
};

// 对外导出的 Vue 转换方法
const parseVueFile: (
  path: string,
  context: Context,
) => Promise<FileStats> = async (path, context) => {
  const fileStats: FileStats = {
    path,
    extname: extname(path),
    dirname: dirname(path),
    imports: [],
  };

  return fileStats;
};

// 编译 scss & less
const compileScss = (scssText: string, path: string) => {
  const importer: Importer = (url, prev, done) => {
    const { join, normalize } = pathModule;
    url = normalize(url);
    const srcPath = join(process.cwd(), 'src');
    // @import('@/xxx/yyy') -> 将@替换为src目录，输出为绝对路径。
    // @import('../xxx/yyy) -> 将相对路径解析为绝对路径
    if (url.startsWith('@')) {
      url = url.replace(/^@/, srcPath);
    } else {
      url = join(path, url);
    }
    return { file: url };
  };
  return sass.renderSync({ data: scssText, importer }).css.toString();
};
const compileLess = async (lessText: string) => {
  return less
    .render(lessText, {
      plugins: [
        // less 插件，用于覆盖 less 默认的 import 规则。
        {
          install(less, pluginManager) {
            class CustomImporter extends (less as any).FileManager {
              loadFile(filename: string, ...args) {
                console.log('filename', filename);
                return super.loadFile(filename, ...args);
              }
            };

            (pluginManager as any).fileManagers.push(new CustomImporter());
            console.log(
              '(pluginManager as any).fileManagers',
              (pluginManager as any).fileManagers,
            );
          },
        },
      ],
    })
    .then(({ css }) => {
      console.log('css', css);
      return css;
    });
};

parseSFCFileToString(
  pathModule.join(process.cwd(), 'src/testFolder/CommentDetailLess.vue'),
).then(({ script, styles, template }) => {
  const compileResult = vueCompiler.compile(template);
  compileResult.ast;
});

export {
  parseVueFile as default,
  compileScss,
  compileLess,
  parseSFCFileToString,
};
