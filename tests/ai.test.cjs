const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadAiModule() {
  const file = 'src/lib/ai.ts';
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  const dependencies = {
    '../../ai/sentiment': require('../ai/sentiment'),
    '../../ai/model-edom.json': require('../ai/model-edom.json'),
  };
  const load = (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  };
  vm.runInThisContext(`(function(require, module, exports) { ${outputText}\n})`, {
    filename: file,
  })(load, module, module.exports);
  return module.exports;
}

const { classifyReviewSentiment, analyzeSessionSentiment } = loadAiModule();

test('classifyReviewSentiment predicts positive and negative Indonesian practicum comments offline', () => {
  const positive = classifyReviewSentiment(
    'Alhamdulillah penyampaian materi sangat jelas dan mudah dipahami, terima kasih pak.',
  );
  assert.equal(positive.status, 'predicted');
  assert.equal(positive.label, 'positif');

  const negative = classifyReviewSentiment(
    'Fasilitas komputer buruk, proyektor tidak jelas dan sering mati, mengajar terlalu cepat.',
  );
  assert.equal(negative.status, 'predicted');
  assert.equal(negative.label, 'negatif');
});

test('classifyReviewSentiment returns null label for empty or unknown vocabulary without treating as netral', () => {
  const empty = classifyReviewSentiment('   ');
  assert.equal(empty.label, null);
  assert.equal(empty.status, 'empty_input');

  const unknown = classifyReviewSentiment('zzzzxxxx qqqqwwww vvvvbbbb');
  assert.equal(unknown.label, null);
  assert.equal(unknown.status, 'unknown_vocabulary');
});

test('analyzeSessionSentiment aggregates multiple session reviews and reports counts and summary', async () => {
  const result = await analyzeSessionSentiment([
    'Penyampaian materi sangat jelas dan mudah dipahami.',
    'Cara mengajar sangat baik, sabar, dan menyenangkan.',
    'Ruangan kadang panas dan proyektor kurang jelas.',
    'zzzzxxxx qqqqwwww',
  ]);

  assert.equal(result.sentiment, 'positif');
  assert.equal(result.counts.positif, 2);
  assert.equal(result.counts.negatif, 1);
  assert.equal(result.counts.unrecognized, 1);
  assert.match(result.summary, /Dari 3 ulasan teranalisis/);
  assert.match(result.summary, /2 positif/);
  assert.match(result.summary, /1 belum dikenali/);
});

test('analyzeSessionSentiment rejects empty review lists or all-unrecognized comments with clear Indonesian messages', async () => {
  await assert.rejects(
    () => analyzeSessionSentiment([]),
    /Belum ada ulasan praktikan yang dapat dianalisis/,
  );

  await assert.rejects(
    () => analyzeSessionSentiment(['   ', '']),
    /Belum ada ulasan praktikan yang dapat dianalisis/,
  );

  await assert.rejects(
    () => analyzeSessionSentiment(['zzzzxxxx qqqqwwww', 'xxxxzzzz']),
    /Ulasan belum dapat dianalisis karena kata-kata belum dikenali/,
  );
});
