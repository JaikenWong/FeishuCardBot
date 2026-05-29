/**
 * 表单 schema 加载 + 字段选项解析。
 * 选项来源：static（配置内写死）或 plm（调 plm-client 动态拉取）。
 */
const fs = require('fs')
const path = require('path')
const plmClient = require('./plm-client')

const DEFAULT_SCHEMA_PATH = path.join(__dirname, '..', 'config', 'form-schema.json')

const ENDPOINT_MAP = {
  projects: 'getProjectOptions',
  libraries: 'getLibraryOptions',
  views: 'getViewOptions',
  folders: 'getFolderOptions',
  categories: 'getCategoryOptions',
}

function loadSchema(schemaPath = DEFAULT_SCHEMA_PATH) {
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
}

function normalizeOption(opt) {
  return {
    text: opt.text ?? opt.label ?? opt.name ?? String(opt.value ?? opt.id ?? ''),
    value: opt.value ?? opt.id ?? opt.name ?? '',
  }
}

async function resolveFieldOptions(field, client = plmClient) {
  const src = field.optionSource
  if (!src) return { options: [], unavailable: false }
  if (src.type === 'static') {
    return { options: (src.options || []).map(normalizeOption), unavailable: false }
  }
  if (src.type === 'plm') {
    const fnName = ENDPOINT_MAP[src.endpoint]
    try {
      const raw = await client[fnName]()
      const options = (raw || []).map(normalizeOption)
      return { options, unavailable: options.length === 0 }
    } catch {
      return { options: [], unavailable: true }
    }
  }
  return { options: [], unavailable: false }
}

async function resolveFields(schema, client = plmClient) {
  return Promise.all(
    schema.fields.map(async (f) => {
      if (f.type === 'select') {
        const { options, unavailable } = await resolveFieldOptions(f, client)
        return { ...f, options, unavailable }
      }
      return { ...f }
    })
  )
}

module.exports = { loadSchema, resolveFields, resolveFieldOptions, normalizeOption, ENDPOINT_MAP, DEFAULT_SCHEMA_PATH }