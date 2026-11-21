const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

exports.loadTypeScript = (file, dependencies = {}) => {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  vm.runInThisContext('(function(require, module, exports) { ' + outputText + '\n})', { filename: file })(
    (name) => {
      if (name === 'react/jsx-runtime') return require(name);
      if (!(name in dependencies)) throw new Error('Unexpected import: ' + name);
      return dependencies[name];
    }, module, module.exports,
  );
  return module.exports;
};
