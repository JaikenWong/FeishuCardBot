/**
 * 消息卡片模板（飞书卡片 2.0 格式）
 *
 * - buildCreatePartCard：async，prefill + form-config driven
 * - buildResultCard：同步，结果展示
 */

const formConfig = require('./form-config')

// ============================================
// 辅助：生成下拉选择的 options
// ============================================

function buildSelectOptions(options) {
  return options.map((opt) => ({
    text: { tag: 'plain_text', content: opt.text },
    value: opt.value,
  }))
}

// ============================================
// 辅助：渲染单个字段
// ============================================

function renderField(field, prefill) {
  if (field.type === 'input') {
    const el = {
      tag: 'input',
      name: field.name,
      required: !!field.required,
      label: { tag: 'plain_text', content: field.label },
      placeholder: { tag: 'plain_text', content: field.placeholder || '' },
    }
    if (field.maxLength) el.max_length = field.maxLength
    if (prefill[field.name] != null) el.default_value = String(prefill[field.name])
    return [el]
  }
  if (field.type === 'select') {
    const placeholder = field.unavailable ? '暂无可用选项（PLM 不可用）' : field.placeholder || ''
    return [
      {
        tag: 'markdown',
        content: field.required ? `**${field.label}** *` : `**${field.label}**`,
      },
      {
        tag: 'select_static',
        name: field.name,
        placeholder: { tag: 'plain_text', content: placeholder },
        options: buildSelectOptions(field.options || []),
      },
    ]
  }
  return []
}

// ============================================
// 辅助：prefill 非空时生成摘要块
// ============================================

function buildSummary(fields, prefill) {
  const keys = Object.keys(prefill)
  if (keys.length === 0) return []
  const lines = fields
    .filter((f) => prefill[f.name] != null)
    .map((f) => `- **${f.label}**：${prefill[f.name]}`)
    .join('\n')
  return [{ tag: 'markdown', content: `**待确认信息**\n${lines}` }]
}

// ============================================
// 新建部件卡片（async + prefill + form-config driven）
// ============================================

async function buildCreatePartCard(prefill = {}) {
  const schema = formConfig.loadSchema()
  const fields = await formConfig.resolveFields(schema)
  const formElements = [
    ...buildSummary(fields, prefill),
    ...fields.flatMap((f) => renderField(f, prefill)),
    {
      tag: 'button',
      text: { tag: 'plain_text', content: schema.submit?.text || '✅ 确定创建' },
      type: 'primary',
      width: 'fill',
      name: 'submit_btn',
      form_action_type: 'submit',
      behaviors: [
        {
          type: 'callback',
          value: { action: schema.submit?.action || 'submit_create_part' },
        },
      ],
    },
  ]

  return {
    schema: '2.0',
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      title: {
        tag: 'plain_text',
        content: schema.header?.title || '🔧 新建部件',
      },
      template: schema.header?.template || 'blue',
    },
    body: {
      elements: [
        {
          tag: 'form',
          name: 'create_part_form',
          elements: formElements,
        },
      ],
    },
  }
}

// ============================================
// 结果卡片（卡片 2.0 格式）
// ============================================

function buildResultCard(result) {
  const isSuccess = result.success

  const successContent = isSuccess
    ? [
        { tag: 'markdown', content: `**物料名称**：${result.data.materialName}` },
        { tag: 'markdown', content: `**项目号**：${result.data.projectNumber}` },
        { tag: 'markdown', content: `**所在库**：${result.data.library}` },
        { tag: 'markdown', content: `**视图**：${result.data.view}` },
        { tag: 'markdown', content: `**文件夹**：${result.data.folder}` },
        { tag: 'markdown', content: `**分类**：${result.data.category}` },
        { tag: 'markdown', content: `**部件编号**：${result.data.partNumber || '-'}` },
      ]
    : [
        {
          tag: 'markdown',
          content: `❌ **创建失败**\n\n${result.message}\n\n请检查输入后重试。`,
        },
      ]

  return {
    schema: '2.0',
    config: { wide_screen_mode: true },
    header: {
      title: {
        tag: 'plain_text',
        content: isSuccess ? '✅ 部件创建成功' : '❌ 部件创建失败',
      },
      template: isSuccess ? 'green' : 'red',
    },
    body: {
      elements: successContent,
    },
  }
}

module.exports = {
  buildCreatePartCard,
  buildResultCard,
}