export type SessionSentiment = 'positif' | 'netral' | 'negatif';

export type SentimentStatus = 'predicted' | 'unknown_vocabulary' | 'empty_input';

export type CommentPredictionResult = {
  label: SessionSentiment | null;
  status: SentimentStatus;
  scores: number[] | null;
  scoreType: 'decision_margin' | 'log_score' | 'none';
  experimental: boolean;
};

export type SentimentCounts = {
  positif: number;
  netral: number;
  negatif: number;
  unrecognized: number;
};

export type SessionSentimentResult = {
  sentiment: SessionSentiment;
  summary: string;
  counts: SentimentCounts;
};

type SentimentModel = {
  schema_version: number;
  status: string;
  algorithm: string;
  preprocessing: string;
  labels: SessionSentiment[];
  aliases: Record<string, string>;
  vocabulary: Record<string, number>;
  idf: number[];
  weights: number[][];
  bias: number[];
};

type SentimentModule = {
  createSentimentClassifier: (model: SentimentModel) => (text: string) => CommentPredictionResult;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createSentimentClassifier } = require('../../ai/sentiment') as SentimentModule;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const edomModel = require('../../ai/model-edom.json') as SentimentModel;

const classifyText = createSentimentClassifier(edomModel);

const SENTIMENT_DESCRIPTION: Record<SessionSentiment, string> = {
  positif: 'Mayoritas praktikan memberikan tanggapan positif terhadap jalannya sesi praktikum.',
  netral: 'Ulasan praktikan terhadap sesi praktikum bersifat netral atau berimbang.',
  negatif: 'Mayoritas praktikan menyampaikan keluhan atau kendala pada sesi praktikum ini.',
};

export function classifyReviewSentiment(comment: string): CommentPredictionResult {
  if (typeof comment !== 'string') {
    throw new TypeError('Ulasan harus berupa teks.');
  }
  return classifyText(comment);
}

export async function analyzeSessionSentiment(reviews: string[]): Promise<SessionSentimentResult> {
  if (!Array.isArray(reviews)) {
    throw new TypeError('Daftar ulasan harus berupa array teks.');
  }

  const nonEmptyReviews = reviews
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (nonEmptyReviews.length === 0) {
    throw new Error('Belum ada ulasan praktikan yang dapat dianalisis.');
  }

  const counts: SentimentCounts = {
    positif: 0,
    netral: 0,
    negatif: 0,
    unrecognized: 0,
  };

  const marginSums: Record<SessionSentiment, number> = {
    negatif: 0,
    netral: 0,
    positif: 0,
  };

  for (const comment of nonEmptyReviews) {
    const prediction = classifyReviewSentiment(comment);
    if (prediction.label === null) {
      counts.unrecognized += 1;
      continue;
    }

    counts[prediction.label] += 1;
    if (Array.isArray(prediction.scores)) {
      edocLabelsForScores(edomModel.labels, prediction.scores, marginSums);
    }
  }

  const recognizedTotal = counts.positif + counts.netral + counts.negatif;
  if (recognizedTotal === 0) {
    throw new Error(
      'Ulasan belum dapat dianalisis karena kata-kata belum dikenali. Minta praktikan menulis ulasan yang lebih jelas.',
    );
  }

  const candidates: SessionSentiment[] = ['positif', 'netral', 'negatif'];
  candidates.sort((a, b) => {
    if (counts[b] !== counts[a]) {
      return counts[b] - counts[a];
    }
    return marginSums[b] - marginSums[a];
  });

  const sentiment = candidates[0];
  const unrecognizedNote =
    counts.unrecognized > 0 ? `, ${counts.unrecognized} belum dikenali` : '';
  const summary = `Dari ${recognizedTotal} ulasan teranalisis (${counts.positif} positif, ${counts.netral} netral, ${counts.negatif} negatif${unrecognizedNote}). ${SENTIMENT_DESCRIPTION[sentiment]}`;

  return {
    sentiment,
    summary,
    counts,
  };
}

function edocLabelsForScores(
  labels: SessionSentiment[],
  scores: number[],
  marginSums: Record<SessionSentiment, number>,
) {
  labels.forEach((label, index) => {
    const value = scores[index];
    if (typeof value === 'number' && Number.isFinite(value)) {
      marginSums[label] += value;
    }
  });
}
