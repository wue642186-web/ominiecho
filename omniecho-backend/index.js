require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

const TOPIC_MAP = {
  '科技與創新': { category: 'technology', keywords: [] },
  '健康醫療':   { category: 'health',       keywords: [] },
  '財經商業':   { category: 'business',     keywords: [] },
  '體育娛樂':   { category: 'sports',       keywords: [] },
  '國際時事':   { category: 'world',        keywords: [] },
  '政治法律':   { category: 'nation',       keywords: ['政治','法案','立法','政府','選舉','法院'] },
  '社會議題':   { category: 'nation',       keywords: ['社會','議題','民眾','福利','人權'] },
  '教育學習':   { category: 'general',      keywords: ['教育','學校','學生','課程','學習','大學','考試','師生','校園','研究','學測','補習','留學'] },
  '文化藝術':   { category: 'entertainment',keywords: ['文化','藝術','展覽','博物館','音樂','電影'] },
  '生活風格':   { category: 'general',      keywords: ['生活','美食','旅遊','穿搭','健康'] },
  '環境永續':   { category: 'science',      keywords: ['環境','氣候','永續','生態','碳'] },
  '科學探索':   { category: 'science',      keywords: ['科學','研究','發現','太空','物理','生物'] },
};

const SENSITIVE_WORDS = ['自殺', '自殘'];

function matchesKeywords(article, keywords) {
  if (keywords.length === 0) return true;
  const text = (article.title || '') + (article.description || '');
  return keywords.some(kw => text.includes(kw));
}

function isSensitive(article) {
  const text = (article.title || '') + (article.description || '');
  return SENSITIVE_WORDS.some(kw => text.includes(kw));
}

app.get('/api/news', async (req, res) => {
  const { topic } = req.query;
  const { category, keywords } = TOPIC_MAP[topic] || { category: 'general', keywords: [] };
  const apiKey = process.env.GNEWS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: '伺服器未設定 GNEWS_API_KEY' });
  }

  const url = `https://gnews.io/api/v4/top-headlines?category=${category}&lang=zh&country=tw&max=10&apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `GNews API 錯誤：${response.status}`, detail: text });
    }

    const data = await response.json();
    const safe = (data.articles || []).filter(a => !isSensitive(a));
    const filtered = safe.filter(a => matchesKeywords(a, keywords));
    const articles = (filtered.length > 0 ? filtered : safe)
      .slice(0, 5)
      .map(article => ({
        title: article.title,
        description: article.description,
        url: article.url,
        source: article.source?.name || '',
        publishedAt: article.publishedAt,
      }));

    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: '呼叫 GNews API 失敗', detail: err.message });
  }
});

app.get('/api/article-content', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: '缺少 url 參數' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    clearTimeout(timer);

    if (!response.ok) throw new Error('HTTP ' + response.status);
    const html = await response.text();

    const $ = cheerio.load(html);
    const paragraphs = [];
    $('p').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length >= 15) paragraphs.push(text);
    });

    res.json({ paragraphs: paragraphs.slice(0, 20) });
  } catch (err) {
    clearTimeout(timer);
    console.log('article-content 抓取失敗:', err.message, '| url:', url);
    res.json({ paragraphs: [] });
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
