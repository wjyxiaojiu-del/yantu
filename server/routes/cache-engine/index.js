import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_PATH = join(__dirname, 'cache.json');
const STATS_PATH = join(__dirname, 'stats.json');
const QUERIES_PATH = join(__dirname, 'queries.json');

export class CacheEngine {
  constructor(options = {}) {
    this.systemPrompt = options.systemPrompt || '';
    this.domainSynonyms = options.domainSynonyms || {};
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0, total: 0 };
    this.queryLog = new Map(); // Track query patterns
    this.ttl = options.ttl || 7 * 24 * 60 * 60 * 1000; // 7 days
    this.loadCache();
    this.loadQueryLog();
  }

  // Normalize query: lowercase, remove extra spaces, apply synonyms
  normalizeQuery(query) {
    let normalized = query.toLowerCase().trim();

    // Remove punctuation
    normalized = normalized.replace(/[，。！？、；：""''（）【】《》\s]+/g, ' ');

    // Apply domain synonyms FIRST (before removing fillers)
    for (const [key, value] of Object.entries(this.domainSynonyms)) {
      normalized = normalized.replace(new RegExp(key, 'gi'), value);
    }

    // Remove common filler words (only at the end or beginning)
    const fillers = ['吗', '呢', '吧', '啊', '呀', '哦', '嗯'];
    for (const filler of fillers) {
      normalized = normalized.replace(new RegExp(filler + '$', 'g'), '');
    }

    // Remove extra spaces
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
  }

  // Generate cache key from normalized query only (ignore dynamic context)
  getCacheKey(query) {
    const normalized = this.normalizeQuery(query);
    // Only use the normalized query for cache key, not the system prompt
    // because system prompt contains dynamic project data
    return crypto.createHash('md5').update(normalized).digest('hex');
  }

  // Get from cache
  get(query) {
    const key = this.getCacheKey(query);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.stats.total++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.total++;
      return null;
    }

    this.stats.hits++;
    this.stats.total++;
    entry.hits++;
    entry.lastAccess = Date.now();

    return entry.response;
  }

  // Set cache
  set(query, response) {
    const key = this.getCacheKey(query);

    this.cache.set(key, {
      query: this.normalizeQuery(query),
      response,
      timestamp: Date.now(),
      lastAccess: Date.now(),
      hits: 0,
    });

    // Auto-save periodically
    this.saveCache();
  }

  // Process with cache
  async process(query, llmFn) {
    // Log query for pattern learning
    this.logQuery(query);

    // Check cache first
    const cached = this.get(query);
    if (cached) {
      return { content: cached, fromCache: true };
    }

    // Call LLM
    const result = await llmFn(query);

    // Cache the result
    this.set(query, result);

    return { content: result, fromCache: false };
  }

  // Log query for adaptive learning
  logQuery(query) {
    const normalized = this.normalizeQuery(query);
    const count = (this.queryLog.get(normalized) || 0) + 1;
    this.queryLog.set(normalized, count);

    // Save periodically
    if (this.queryLog.size % 10 === 0) {
      this.saveQueryLog();
    }
  }

  // Get hot queries (most frequently asked)
  getHotQueries(limit = 20) {
    const sorted = Array.from(this.queryLog.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([query, count]) => ({ query, count }));

    return sorted;
  }

  // Load query log
  loadQueryLog() {
    try {
      if (existsSync(QUERIES_PATH)) {
        const data = JSON.parse(readFileSync(QUERIES_PATH, 'utf-8'));
        this.queryLog = new Map(data.entries || []);
        console.log(`[CacheEngine] Loaded ${this.queryLog.size} query patterns`);
      }
    } catch (e) {
      console.warn('[CacheEngine] Failed to load query log:', e.message);
    }
  }

  // Save query log (async, non-blocking)
  saveQueryLog() {
    const data = {
      entries: Array.from(this.queryLog.entries()),
      savedAt: new Date().toISOString(),
    };
    writeFile(QUERIES_PATH, JSON.stringify(data, null, 2)).catch(e => {
      console.warn('[CacheEngine] Failed to save query log:', e.message);
    });
  }

  // Load cache from disk
  loadCache() {
    try {
      if (existsSync(CACHE_PATH)) {
        const data = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
        this.cache = new Map(data.entries || []);
        console.log(`[CacheEngine] Loaded ${this.cache.size} cached entries`);
      }
      if (existsSync(STATS_PATH)) {
        this.stats = JSON.parse(readFileSync(STATS_PATH, 'utf-8'));
      }
    } catch (e) {
      console.warn('[CacheEngine] Failed to load cache:', e.message);
    }
  }

  // Save cache to disk (async, non-blocking)
  saveCache() {
    const data = {
      entries: Array.from(this.cache.entries()),
      savedAt: new Date().toISOString(),
    };
    Promise.all([
      writeFile(CACHE_PATH, JSON.stringify(data, null, 2)),
      writeFile(STATS_PATH, JSON.stringify(this.stats, null, 2)),
    ]).catch(e => {
      console.warn('[CacheEngine] Failed to save cache:', e.message);
    });
  }

  // Get stats
  getStats() {
    const hitRate = this.stats.total > 0
      ? (this.stats.hits / this.stats.total * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      cacheSize: this.cache.size,
    };
  }

  // Check if query exists in cache without incrementing stats
  has(query) {
    const key = this.getCacheKey(query);
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  // Warmup cache with common queries
  async warmup(llmFn, queries) {
    console.log(`[CacheEngine] Starting warmup with ${queries.length} queries...`);
    let warmed = 0;
    let skipped = 0;

    for (const query of queries) {
      if (this.has(query)) {
        skipped++;
        continue;
      }
      try {
        const result = await llmFn(query);
        this.set(query, result);
        warmed++;
      } catch (e) {
        console.warn(`[CacheEngine] Warmup failed for "${query}":`, e.message);
      }
    }

    console.log(`[CacheEngine] Warmup complete: ${warmed} new, ${skipped} skipped`);
    return warmed;
  }

  // Clear expired entries
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[CacheEngine] Cleaned ${cleaned} expired entries`);
      this.saveCache();
    }

    return cleaned;
  }
}

// Domain synonyms for research/academic context
export const DEFAULT_SYNONYMS = {
  // 敏捷术语
  '迭代': 'sprint',
  '冲刺': 'sprint',
  '待办': 'backlog',
  '看板': 'kanban',
  '站会': 'standup',
  '每日站会': 'standup',
  '故事点': 'story_points',
  '用户故事': 'user_story',
  '史诗': 'epic',
  '燃尽图': 'burndown',
  '速率': 'velocity',
  '阻塞': 'blocker',
  '阻碍': 'blocker',
  '拆解': 'breakdown',
  '拆分': 'breakdown',

  // 学术术语
  '文献综述': 'literature_review',
  '文献回顾': 'literature_review',
  '开题报告': 'proposal',
  '研究计划': 'proposal',
  '论文': 'thesis',
  '毕业论文': 'thesis',
  '学位论文': 'thesis',
  '答辩': 'defense',
  '毕业答辩': 'defense',
  '中期检查': 'midterm',
  '盲审': 'blind_review',

  // 生物医学
  '凋亡': 'apoptosis',
  '细胞凋亡': 'apoptosis',
  '程序性死亡': 'apoptosis',
  '自噬': 'autophagy',
  '细胞自噬': 'autophagy',
  '基因表达': 'gene_expression',
  '蛋白表达': 'protein_expression',
  '蛋白质': 'protein',
  '信号通路': 'signaling_pathway',
  '信号传导': 'signaling',
  '转录': 'transcription',
  '翻译': 'translation',
  'PCR': 'pcr',
  'qPCR': 'qpcr',
  'Western Blot': 'western_blot',
  'WB': 'western_blot',
  '免疫荧光': 'immunofluorescence',
  'IF': 'immunofluorescence',
  '流式细胞术': 'flow_cytometry',
  'FCM': 'flow_cytometry',

  // 常见问法变体
  '怎么': '如何',
  '怎样': '如何',
  '能不能': '可以',
  '可不可以': '可以',
  '帮我看一下': '分析',
  '帮我看看': '分析',
  '麻烦': '请',
  '谢谢': '',
  '感谢': '',
};
