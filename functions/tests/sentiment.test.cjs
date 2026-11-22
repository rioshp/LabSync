const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createSentimentClassifier } = require('../ai/sentiment');
const model = require('../ai/model-edom.json');

test('the bundled model returns all three labels on Indonesian examples', () => {
  const classify = createSentimentClassifier(model);
  const fixtures = [
    ['Penyampaian materi sangat jelas dan mudah dipahami, terima kasih pak.', 'positif'],
    ['Pelaksanaan praktikum cukup sesuai jadwal.', 'netral'],
    [
      'Fasilitas komputer buruk, proyektor tidak jelas dan sering mati, mengajar terlalu cepat.',
      'negatif',
    ],
  ];
  for (const [text, label] of fixtures) assert.equal(classify(text).label, label);
  assert.equal(classify('').label, null);
});
