/**
 * 新建部件 - 消息卡片模板（飞书卡片 2.0 格式）
 *
 * 卡片结构：
 *   标题 → 表单容器 → 物料名称(输入框) / 物料项目号(下拉) / 所在库(下拉) /
 *                     视图(下拉) / 所在文件夹(下拉) / 物料分类(下拉) → 提交按钮
 *
 * 注意：
 * - form / input / select_static 等组件需要飞书卡片 2.0（schema: "2.0"）
 * - input 支持 label 属性，select_static 不支持 label
 * - select_static 的标签需要用 markdown 元素单独显示
 * - 表单提交按钮需要 form_action_type: "submit" + behaviors 回调
 */

// ============================================
// 下拉选项数据（实际场景中可从 PLM 系统动态拉取）
// ============================================

const PROJECT_OPTIONS = [
  { text: 'PRJ-2024-001 智能终端项目', value: 'PRJ-2024-001' },
  { text: 'PRJ-2024-002 车载芯片项目', value: 'PRJ-2024-002' },
  { text: 'PRJ-2024-003 工业控制项目', value: 'PRJ-2024-003' },
]

const LIBRARY_OPTIONS = [
  { text: '企业标准库', value: 'enterprise_std' },
  { text: '项目共享库', value: 'project_shared' },
  { text: '个人工作库', value: 'personal_work' },
]

const VIEW_OPTIONS = [
  { text: '设计视图', value: 'design' },
  { text: '制造视图', value: 'manufacturing' },
  { text: '工艺视图', value: 'process' },
]

const FOLDER_OPTIONS = [
  { text: '/根目录', value: '/' },
  { text: '/电子元器件', value: '/electronic' },
  { text: '/机械零部件', value: '/mechanical' },
  { text: '/标准件', value: '/standard' },
]

const CATEGORY_OPTIONS = [
  { text: '电子元器件 - IC芯片', value: 'ic_chip' },
  { text: '电子元器件 - 被动元件', value: 'passive' },
  { text: '机械零部件 - 结构件', value: 'structural' },
  { text: '机械零部件 - 紧固件', value: 'fastener' },
  { text: '标准件 - 连接器', value: 'connector' },
  { text: '标准件 - 线缆', value: 'cable' },
]

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
// 辅助：生成带标签的下拉选择（select_static 不支持 label，用 markdown 标签替代）
// ============================================

function buildLabeledSelect(name, labelText, placeholder, options, required = true) {
  return [
    {
      tag: 'markdown',
      content: required ? `**${labelText}** *` : `**${labelText}**`,
    },
    {
      tag: 'select_static',
      name,
      placeholder: { tag: 'plain_text', content: placeholder },
      options: buildSelectOptions(options),
    },
  ]
}

// ============================================
// 卡片 JSON（飞书卡片 2.0 格式）
// ============================================

function buildCreatePartCard() {
  // 将带标签的下拉选项展平到表单元素中
  const formElements = [
    // 物料名称 - 输入框（input 支持 label）
    {
      tag: 'input',
      name: 'material_name',
      required: true,
      label: { tag: 'plain_text', content: '物料名称' },
      placeholder: { tag: 'plain_text', content: '请输入物料名称' },
      max_length: 100,
    },
    // 下拉选择字段（select_static 不支持 label，用 markdown 标签）
    ...buildLabeledSelect('project_number', '物料项目号', '请选择物料项目号', PROJECT_OPTIONS),
    ...buildLabeledSelect('library', '所在库', '请选择所在库', LIBRARY_OPTIONS),
    ...buildLabeledSelect('view', '视图', '请选择视图', VIEW_OPTIONS),
    ...buildLabeledSelect('folder', '所在文件夹', '请选择所在文件夹', FOLDER_OPTIONS),
    ...buildLabeledSelect('category', '物料分类', '请选择物料分类', CATEGORY_OPTIONS),
    // 提交按钮
    {
      tag: 'button',
      text: { tag: 'plain_text', content: '✅ 确定创建' },
      type: 'primary',
      width: 'fill',
      name: 'submit_btn',
      form_action_type: 'submit',
      behaviors: [
        {
          type: 'callback',
          value: { action: 'submit_create_part' },
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
        content: '🔧 新建部件',
      },
      template: 'blue',
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
