/**
 * PLM 系统接口调用模块
 *
 * 封装与 PLM 系统的所有 HTTP 交互，包括：
 * - 创建部件
 * - 查询下拉选项（项目号、库、视图等）
 */

const axios = require('axios')

const PLM_BASE_URL = process.env.PLM_API_BASE_URL || 'https://plm.example.com/api'
const PLM_TOKEN = process.env.PLM_API_TOKEN || ''

/**
 * 创建 Axios 实例，统一处理请求头和错误
 */
const plmHttpClient = axios.create({
  baseURL: PLM_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    ...(PLM_TOKEN ? { Authorization: `Bearer ${PLM_TOKEN}` } : {}),
  },
})

// 响应拦截器
plmHttpClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const msg = error.response?.data?.message || error.message || 'PLM 接口调用失败'
    console.error(`[PLM] 请求失败: ${msg}`)
    return Promise.reject(new Error(msg))
  }
)

/**
 * 创建部件
 * @param {Object} params - 部件参数
 * @param {string} params.materialName  - 物料名称
 * @param {string} params.projectNumber - 物料项目号
 * @param {string} params.library       - 所在库
 * @param {string} params.view          - 视图
 * @param {string} params.folder        - 所在文件夹
 * @param {string} params.category      - 物料分类
 * @returns {Promise<Object>} 创建结果
 */
async function createPart(params) {
  const {
    materialName,
    projectNumber,
    library,
    view,
    folder,
    category,
  } = params

  console.log(`[PLM] 创建部件: ${materialName}, 项目: ${projectNumber}`)

  try {
    // -------------------------------------------------------
    // TODO: 根据实际 PLM 接口文档替换请求路径和参数结构
    // 当前为示例结构，实际对接时需要调整
    // -------------------------------------------------------
    const result = await plmHttpClient.post('/parts', {
      name: materialName,
      projectNumber,
      library,
      view,
      folder,
      category,
    })

    console.log(`[PLM] 部件创建成功: ${JSON.stringify(result)}`)
    return {
      success: true,
      data: {
        materialName,
        projectNumber,
        library,
        view,
        folder,
        category,
        partNumber: result.partNumber || result.part_number || result.id || '-',
      },
    }
  } catch (err) {
    console.error(`[PLM] 部件创建失败: ${err.message}`)
    return {
      success: false,
      message: err.message,
    }
  }
}

/**
 * 获取物料项目号列表（下拉选项数据源）
 * TODO: 对接实际接口后替换
 */
async function getProjectOptions() {
  try {
    const result = await plmHttpClient.get('/options/projects')
    return result.options || []
  } catch {
    return []
  }
}

/**
 * 获取所在库列表
 */
async function getLibraryOptions() {
  try {
    const result = await plmHttpClient.get('/options/libraries')
    return result.options || []
  } catch {
    return []
  }
}

/**
 * 获取视图列表
 */
async function getViewOptions() {
  try {
    const result = await plmHttpClient.get('/options/views')
    return result.options || []
  } catch {
    return []
  }
}

/**
 * 获取文件夹列表
 */
async function getFolderOptions() {
  try {
    const result = await plmHttpClient.get('/options/folders')
    return result.options || []
  } catch {
    return []
  }
}

/**
 * 获取物料分类列表
 */
async function getCategoryOptions() {
  try {
    const result = await plmHttpClient.get('/options/categories')
    return result.options || []
  } catch {
    return []
  }
}

module.exports = {
  createPart,
  getProjectOptions,
  getLibraryOptions,
  getViewOptions,
  getFolderOptions,
  getCategoryOptions,
}
