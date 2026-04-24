# 德州扑克 CLI (Texas Poker CLI)

一款支持联机与本机 AI 对局的命令行德州扑克游戏，包含正常模式与摸鱼模式两种 UI。

## 特性

- 多人联机对战（基于 Socket.io）
- 大厅 / 主菜单启动流程，进入后再选择本机局或联机局
- 完整的德州扑克规则（翻牌前、翻牌圈、转牌圈、河牌圈、摊牌）
- 牌型自动判断（高牌、一对、两对、三条、顺子、同花、葫芦、四条、同花顺、皇家同花顺）
- AI 玩家带有 `soul`（人格原型 + 扰动特质）和本次会话短期记忆
- 支持玩家简介：GM 可看完整档案，普通玩家只能看到逐步揭示的画像
- 两种 UI 模式：
  - **正常模式 (client)** — 完整的牌桌视图、手牌展示、玩家状态、操作日志
  - **摸鱼模式 (slacker)** — 全屏假代码滚动 + 右下角最小化游戏信息浮窗

## 快速开始

### 1. 安装依赖

```bash
cd texas-poker-cli
npm install
```

### 2. 默认玩法：进入大厅

```bash
npm run play
```

进入大厅后可以选择：

- **本机局**：自动启动本地服务器，配置 1 位真人 + 多个 AI
- **联机局：创建房间**：创建房间并按需补 AI
- **联机局：加入房间**：加入已有房间

### 3. 高级入口（兼容旧方式）

启动服务器：

```bash
npx ts-node src/index.ts server --port 3000
```

普通模式加入：

```bash
npx ts-node src/index.ts client -r room1 -n Alice
```

### 4. 摸鱼模式

```bash
npx ts-node src/index.ts slacker -r room1 -n Charlie
```

## 操作说明

| 按键 | 动作 |
|------|------|
| `f` | 弃牌 (Fold) |
| `c` | 跟注 (Call) |
| `ch` | 过牌 (Check) |
| `r <金额>` | 加注 (Raise) |
| `p` / `profile` | 查看玩家简介 |
| `s` | 开始游戏（房主） |
| `q` / `Ctrl+C` | 退出 |

## 项目结构

```
src/
├── ai/
│   ├── AiPlayer.ts       # AI 玩家
│   ├── prompts.ts        # AI prompt 生成
│   └── soul.ts           # AI 灵魂 / 人格原型
├── core/
│   ├── Card.ts           # 扑克牌定义
│   ├── Deck.ts           # 牌堆（洗牌、发牌）
│   ├── Player.ts         # 玩家状态与行为
│   ├── HandEvaluator.ts  # 牌型判断
│   └── Game.ts           # 游戏状态机
├── network/
│   ├── Server.ts         # Socket.io 服务器
│   └── Client.ts         # Socket.io 客户端
├── runtime/
│   ├── GameLauncher.ts   # 大厅后的统一启动流程
│   └── serverBootstrap.ts# 本地 server 自动拉起
├── session/
│   ├── SessionManager.ts # 会话记忆 / 玩家画像
│   └── types.ts          # 会话类型定义
├── ui/
│   ├── cli/
│   │   └── renderer.ts   # 正常 CLI 界面
│   ├── lobby/
│   │   └── renderer.ts   # 大厅 / 主菜单
│   └── slacker/
│       └── renderer.ts   # 摸鱼模式界面
└── index.ts              # CLI 入口
```

## 技术栈

- TypeScript
- Node.js
- Socket.io（联机通信）
- blessed（终端 UI）
- commander（CLI 参数解析）
