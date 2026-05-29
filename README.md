# 飞书机器人 - 新建部件卡片

一个基于飞书 WebSocket 长连接的机器人，用于通过交互式消息卡片在 PLM 系统中创建部件。

## 功能特性

- ✅ **WebSocket 长连接**：无需公网 IP，内网环境即可运行
- ✅ **交互式消息卡片**：包含输入框、下拉选择等表单元素
- ✅ **PLM 系统集成**：调用 PLM 接口创建部件并返回结果

## 卡片表单字段

| 字段 | 类型 | 说明 |
|------|------|------|
| 物料名称 | 输入框 | 用户手动输入 |
| 物料项目号 | 下拉选择 | 从项目列表选择 |
| 所在库 | 下拉选择 | 企业标准库/项目共享库/个人工作库 |
| 视图 | 下拉选择 | 设计视图/制造视图/工艺视图 |
| 所在文件夹 | 下拉选择 | 部件存储路径 |
| 物料分类 | 下拉选择 | IC芯片/被动元件/结构件等 |

## 快速开始

### 1. 克隆项目

```bash
cd /Users/jaiken/workplace/ai/FeishuCardBot
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并填写配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 飞书应用配置（必填）
FEISHU_APP_ID=cli_xxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxx

# PLM 系统配置（根据实际情况填写）
PLM_API_BASE_URL=https://plm.example.com/api
PLM_API_TOKEN=your_plm_api_token
```

### 4. 飞书应用配置

在飞书开放平台配置应用：

1. **启用机器人能力**
   - 进入应用 → 应用能力 → 机器人
   - 启用机器人功能

2. **配置事件订阅**
   - 进入应用 → 事件与回调 → 订阅方式
   - 选择「**使用长连接接收事件/回调**」（关键步骤！）
   - 无需配置 Request URL
   - 添加事件订阅：`im.message.receive_v1`（接收消息）

3. **配置卡片回调**
   - 进入应用 → 事件与回调 → 卡片回调
   - 同样选择「**使用长连接接收卡片回调**」

4. **添加消息权限**
   - 进入应用 → 权限管理
   - 搜索并开通以下权限：
     - `im:message` - 获取与发送单聊、群组消息
     - `im:message:send_as_bot` - 以应用身份发消息
     - `im:chat` - 获取群组信息
     - `im:resource` - 获取消息中的资源文件

5. **发布版本**
   - 配置完成后，创建版本并发布
   - 用户可在飞书搜索应用名称添加机器人

### 6. 启动机器人

```bash
npm start
```

开发模式（自动重启）：

```bash
npm run dev
```

启动成功后，在飞书中找到机器人发送任意消息，即可收到「新建部件」卡片。

## 项目结构

```
FeishuCardBot/
├── src/
│   ├── index.js          # 入口文件，WebSocket 长连接和消息处理
│   ├── card-template.js  # 消息卡片 JSON 模板
│   └── plm-client.js     # PLM 系统接口调用
├── package.json
├── .env.example          # 环境变量示例
├── .env                  # 环境变量（需自行创建）
└── README.md
```

## 对接真实 PLM 系统

当前项目中的 PLM 接口为示例实现，对接真实系统时需要修改 `src/plm-client.js`：

1. **修改 API 路径和参数结构**
   ```javascript
   // 示例：根据实际接口调整
   const result = await plmHttpClient.post('/parts', {
     name: materialName,
     projectNumber,
     // ... 其他字段按实际接口要求映射
   })
   ```

2. **动态获取下拉选项**
   - 实现 `getProjectOptions()`、`getLibraryOptions()` 等方法
   - 在 `card-template.js` 中调用这些方法获取真实数据

3. **认证方式**
   - 如果 PLM 系统使用其他认证方式（如 Basic Auth、API Key）
   - 修改 `plmHttpClient` 的请求头配置

## 常见问题

### Q: WebSocket 连接失败（400 错误）？

检查：
- App ID 和 App Secret 是否正确
- 应用是否已发布版本
- 是否在飞书开放平台启用了机器人能力
- **是否在「事件与回调」→「订阅方式」中选择了「使用长连接接收事件/回调」**（这是关键！）
- 是否在事件订阅中添加了 `im.message.receive_v1` 事件

### Q: 收不到消息？

检查：
- 是否开通了 `im:message` 权限
- 用户是否已添加机器人为好友
- 查看控制台日志是否有错误信息

### Q: 卡片发送失败？

检查：
- 卡片 JSON 格式是否正确
- 是否开通了 `im:message:send_as_bot` 权限

## 技术栈

- [Node.js](https://nodejs.org/) >= 18
- [@larksuiteoapi/node-sdk](https://github.com/larksuite/oapi-sdk-nodejs) - 飞书官方 Node SDK
- [axios](https://github.com/axios/axios) - HTTP 客户端
- [dotenv](https://github.com/motdotla/dotenv) - 环境变量管理

## License

MIT
