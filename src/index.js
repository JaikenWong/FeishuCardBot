/**
 * 飞书机器人 - WebSocket 长连接模式
 *
 * 功能：
 * 1. 用户发送消息时，推送「新建部件」消息卡片
 * 2. 用户填写表单并点击「确定创建」后，接收卡片回调
 * 3. 调用 PLM 系统接口创建部件，返回结果卡片
 *
 * 启动方式：node src/index.js
 */

require('dotenv').config()
const {
  Client,
  WSClient,
  EventDispatcher,
  LoggerLevel,
} = require('@larksuiteoapi/node-sdk')
const { buildCreatePartCard, buildResultCard } = require('./card-template')
const { createPart } = require('./plm-client')

// ============================================
// 配置
// ============================================

const APP_ID = process.env.FEISHU_APP_ID
const APP_SECRET = process.env.FEISHU_APP_SECRET

if (!APP_ID || !APP_SECRET) {
  console.error('❌ 请在 .env 文件中配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET')
  process.exit(1)
}

// ============================================
// 初始化飞书 Client
// ============================================

const client = new Client({
  appId: APP_ID,
  appSecret: APP_SECRET,
  appType: 0, // 自建应用
  domain: 0,  // Feishu
})

// ============================================
// 事件处理器
// ============================================

const eventDispatcher = new EventDispatcher({
  loggerLevel: LoggerLevel.info,
}).register({
  // 接收消息事件
  'im.message.receive_v1': async (data) => {
    console.log('📩 收到消息:', JSON.stringify(data, null, 2))
    await handleMessage(data)
  },
  // 接收卡片交互事件（表单提交/按钮点击）
  'card.action.trigger': async (data) => {
    console.log('🎴 收到卡片回调:', JSON.stringify(data, null, 2))
    await handleCardCallback(data)
    return {}
  },
})

// ============================================
// 消息处理：用户发消息时推送卡片
// ============================================

async function handleMessage(data) {
  try {
    const { sender, message } = data

    if (!message || !sender) {
      return
    }

    const openId = sender?.sender_id?.open_id
    const chatId = message?.chat_id
    const msgType = message?.message_type

    console.log(`👤 用户消息: openId=${openId}, chatId=${chatId}, type=${msgType}`)

    // 发送「新建部件」卡片
    await sendCreatePartCard(chatId)
  } catch (err) {
    console.error('❌ 处理消息失败:', err)
  }
}

/**
 * 发送「新建部件」卡片
 */
async function sendCreatePartCard(chatId) {
  try {
    const card = buildCreatePartCard()

    const res = await client.im.message.create({
      params: {
        receive_id_type: 'chat_id',
      },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    })

    console.log('📤 卡片发送成功:', res?.data?.message_id)
  } catch (err) {
    console.error('❌ 发送卡片失败:', err)
  }
}

// ============================================
// 卡片回调处理：用户点击「确定创建」
// ============================================

async function handleCardCallback(data) {
  try {
    console.log('🔍 回调完整数据:', JSON.stringify(data, null, 2))

    const { action, operator } = data
    const openId = operator?.open_id || data.open_id

    // form_submit 回调：action.action_type === 'form_submit'
    // 或者通过 action.name 判断
    const isSubmit =
      action?.action_type === 'form_submit' ||
      action?.name === 'submit_btn' ||
      action?.value?.action === 'submit_create_part'

    if (!isSubmit) {
      console.log('⏭ 非提交按钮，忽略')
      return
    }

    // 表单数据位置：
    // - form_submit 回调：action.form_value
    // - 兼容旧方式：data.form_value
    const formValue = action?.form_value || data.form_value || {}
    const formData = {
      materialName: formValue.material_name || '',
      projectNumber: formValue.project_number || '',
      library: formValue.library || '',
      view: formValue.view || '',
      folder: formValue.folder || '',
      category: formValue.category || '',
    }

    console.log('📝 表单数据:', JSON.stringify(formData, null, 2))

    // 调用 PLM 接口创建部件
    const result = await createPart(formData)

    // 发送结果卡片给用户
    await sendResultCard(openId, result)
  } catch (err) {
    console.error('❌ 处理卡片回调失败:', err)
  }
}

/**
 * 发送结果卡片
 */
async function sendResultCard(openId, result) {
  try {
    const card = buildResultCard(result)

    const res = await client.im.message.create({
      params: {
        receive_id_type: 'open_id',
      },
      data: {
        receive_id: openId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    })

    console.log('📤 结果卡片发送成功:', res?.data?.message_id)
  } catch (err) {
    console.error('❌ 发送结果卡片失败:', err)
  }
}

// ============================================
// 启动 WebSocket 长连接
// ============================================

console.log('========================================')
console.log('🤖 飞书机器人 - 新建部件卡片')
console.log('========================================')
console.log(`App ID: ${APP_ID}`)
console.log(`PLM API: ${process.env.PLM_API_BASE_URL || '(未配置)'}`)
console.log('========================================')

const wsClient = new WSClient({
  appId: APP_ID,
  appSecret: APP_SECRET,
  domain: 0, // Feishu
  loggerLevel: LoggerLevel.info,
  onReady: () => {
    console.log('✅ WebSocket 连接成功，等待消息...')
  },
  onError: (err) => {
    console.error('❌ WebSocket 连接失败:', err)
  },
  onReconnecting: () => {
    console.log('⚠️ WebSocket 断开，正在重连...')
  },
  onReconnected: () => {
    console.log('🔄 WebSocket 重连成功')
  },
})

wsClient
  .start({
    eventDispatcher,
  })
  .catch((err) => {
    console.error('❌ 启动失败:', err)
    process.exit(1)
  })

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭...')
  wsClient.close({ force: true })
  process.exit(0)
})
