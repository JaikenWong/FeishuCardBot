const PLM_KEYWORDS = [
  'plm', '物料', '部件', '建料', '创建', '项目号', '所在库', '视图', '文件夹', '分类',
  'material', 'part', 'library', 'project', 'category', 'folder',
]

const OFFTOPIC_KEYWORDS = [
  '天气', '股票', '八卦', '星座', '彩票', '电影', '音乐', '翻译', '写诗',
  'weather', 'stock', 'sports', 'movie', 'music', 'recipe',
]

function isLikelyPlmTopic(text = '') {
  const t = String(text).toLowerCase().trim()
  if (!t) return false
  return PLM_KEYWORDS.some((k) => t.includes(k))
}

function isLikelyOffTopic(text = '') {
  const t = String(text).toLowerCase().trim()
  if (!t) return false
  return OFFTOPIC_KEYWORDS.some((k) => t.includes(k))
}

function shouldRejectTopic(text = '') {
  if (isLikelyPlmTopic(text)) return false
  return isLikelyOffTopic(text)
}

function defaultRejectReply(topicBoundary = '仅 PLM / 物料领域') {
  return `仅支持${topicBoundary}问题。请描述要创建或查询的物料信息。`
}

module.exports = {
  isLikelyPlmTopic,
  isLikelyOffTopic,
  shouldRejectTopic,
  defaultRejectReply,
}
