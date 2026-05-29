/**
 * PLM 系统接口调用模块
 *
 * 默认导出使用环境变量配置；也暴露 createPlmClient 便于测试与自定义对接。
 */

const axios = require('axios')

const DEFAULT_BASE_URL = process.env.PLM_API_BASE_URL || 'https://plm.example.com/api'
const DEFAULT_TOKEN = process.env.PLM_API_TOKEN || ''

const OPTION_ENDPOINTS = {
  projects: '/options/projects',
  libraries: '/options/libraries',
  views: '/options/views',
  folders: '/options/folders',
  categories: '/options/categories',
}

function normalizeOption(raw) {
  return {
    text: raw?.text ?? raw?.label ?? raw?.name ?? String(raw?.value ?? raw?.id ?? ''),
    value: raw?.value ?? raw?.id ?? raw?.name ?? '',
  }
}

function extractOptionArray(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.options)) return payload.options
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

function createHttpClient({ baseURL = DEFAULT_BASE_URL, token = DEFAULT_TOKEN } = {}) {
  const instance = axios.create({
    baseURL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  instance.interceptors.response.use(
    (response) => response.data,
    (error) => {
      const msg = error.response?.data?.message || error.message || 'PLM 接口调用失败'
      console.error(`[PLM] 请求失败: ${msg}`)
      return Promise.reject(new Error(msg))
    }
  )

  return instance
}

function createPlmClient({ httpClient, optionEndpoints = OPTION_ENDPOINTS } = {}) {
  const http = httpClient || createHttpClient()

  async function fetchOptions(kind) {
    const endpoint = optionEndpoints[kind]
    if (!endpoint) return []
    try {
      const result = await http.get(endpoint)
      return extractOptionArray(result).map(normalizeOption)
    } catch {
      return []
    }
  }

  async function createPart(params) {
    const { materialName, projectNumber, library, view, folder, category } = params
    console.log(`[PLM] 创建部件: ${materialName}, 项目: ${projectNumber}`)

    try {
      const result = await http.post('/parts', {
        name: materialName,
        projectNumber,
        library,
        view,
        folder,
        category,
      })

      return {
        success: true,
        data: {
          materialName,
          projectNumber,
          library,
          view,
          folder,
          category,
          partNumber: result?.partNumber || result?.part_number || result?.id || '-',
        },
      }
    } catch (err) {
      console.error(`[PLM] 部件创建失败: ${err.message}`)
      return { success: false, message: err.message }
    }
  }

  return {
    createPart,
    getProjectOptions: () => fetchOptions('projects'),
    getLibraryOptions: () => fetchOptions('libraries'),
    getViewOptions: () => fetchOptions('views'),
    getFolderOptions: () => fetchOptions('folders'),
    getCategoryOptions: () => fetchOptions('categories'),
  }
}

const defaultClient = createPlmClient()

module.exports = {
  ...defaultClient,
  createPlmClient,
  createHttpClient,
  normalizeOption,
  extractOptionArray,
  OPTION_ENDPOINTS,
}
