"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlackerRenderer = void 0;
const blessed_1 = __importDefault(require("blessed"));
// 假代码片段池
const FAKE_CODE_SNIPPETS = [
    'import { useState, useEffect } from "react";',
    'const [data, setData] = useState<T>(null);',
    'useEffect(() => { fetch("/api/data").then(r => r.json()).then(setData); }, []);',
    'const handleSubmit = async (e: FormEvent) => {',
    '  e.preventDefault();',
    '  await api.post("/users", payload);',
    '  toast.success("操作成功");',
    '};',
    'function optimizeQuery<T extends Record<string, any>>(',
    '  table: string,',
    '  where: WhereClause<T>,',
    '  options?: QueryOptions',
    ') {',
    '  const cacheKey = generateCacheKey(table, where);',
    '  if (cache.has(cacheKey)) return cache.get(cacheKey);',
    '  const result = db.query(table).where(where).limit(options?.limit ?? 100);',
    '  cache.set(cacheKey, result, options?.ttl ?? 300);',
    '  return result;',
    '}',
    'export class UserRepository extends BaseRepository<User> {',
    '  async findByEmail(email: string): Promise<User | null> {',
    '    return this.findOne({ where: { email } });',
    '  }',
    '}',
    '// TODO: 优化这里的N+1查询问题',
    'const users = await Promise.all(ids.map(id => User.findById(id)));',
    'const aggregated = users.reduce((acc, user) => {',
    '  acc[user.department] = (acc[user.department] || 0) + 1;',
    '  return acc;',
    '}, {} as Record<string, number>);',
    'docker-compose up -d --build',
    'kubectl get pods -n production',
    'terraform plan -var="env=prod"',
    'git rebase origin/main --interactive',
    'npm run build -- --mode production',
    'eslint --fix src/**/*.{ts,tsx}',
    'jest --coverage --watchAll=false',
    'curl -X POST http://localhost:8080/api/v1/orders \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{ "productId": 42, "quantity": 3 }\'',
    'interface ApiResponse<T> {',
    '  code: number;',
    '  data: T;',
    '  message: string;',
    '}',
    'const middleware = (req: Request, res: Response, next: NextFunction) => {',
    '  const token = req.headers.authorization?.replace("Bearer ", "");',
    '  if (!token) return res.status(401).json({ error: "Unauthorized" });',
    '  jwt.verify(token, SECRET, (err, decoded) => {',
    '    if (err) return res.status(403).json({ error: "Invalid token" });',
    '    req.user = decoded;',
    '    next();',
    '  });',
    '};',
    'ALTER TABLE orders ADD COLUMN status VARCHAR(20) DEFAULT \'pending\';',
    'CREATE INDEX idx_orders_user_id ON orders(user_id);',
    'EXPLAIN ANALYZE SELECT * FROM orders WHERE created_at > NOW() - INTERVAL \'7 days\';',
    'redis-cli --scan --pattern "session:*" | xargs redis-cli del',
    'pm2 logs --lines 50 --timestamp',
    'const memoized = useMemo(() => computeExpensive(a, b), [a, b]);',
    '<div className="flex items-center justify-between p-4" ref={containerRef}>',
    '  {items.map(item => (',
    '    <Card key={item.id} data={item} onClick={handleSelect} />',
    '  ))}',
    '</div>',
    'try {',
    '  await transaction.begin();',
    '  await Order.create(orderData, { transaction });',
    '  await Inventory.decrement(productId, quantity, { transaction });',
    '  await transaction.commit();',
    '} catch (err) {',
    '  await transaction.rollback();',
    '  logger.error("订单创建失败", err);',
    '  throw new OrderCreationError(err.message);',
    '}',
    'describe("PaymentService", () => {',
    '  it("should process payment successfully", async () => {',
    '    const mockGateway = jest.spyOn(gateway, "charge");',
    '    mockGateway.mockResolvedValue({ id: "pay_123", status: "succeeded" });',
    '    const result = await service.process({ amount: 100, currency: "USD" });',
    '    expect(result.status).toBe("success");',
    '    mockGateway.mockRestore();',
    '  });',
    '});',
    'npx prisma migrate dev --name add_user_profile',
    'npx tsc --noEmit',
    'npx playwright test --project=chromium --headed',
    'python -m pytest tests/integration/ -v --tb=short',
    'cargo build --release --target x86_64-unknown-linux-gnu',
    'go test ./... -race -coverprofile=coverage.out',
    'ansible-playbook -i inventory/production deploy.yml --check',
    'nginx -t && systemctl reload nginx',
    'find /var/log -name "*.log" -mtime +30 -delete',
    'rsync -avz --delete --exclude=node_modules ./ dist-server:/app/',
];
class SlackerRenderer {
    screen;
    codeBox;
    pokerBox;
    codeLines = [];
    scrollInterval = null;
    client;
    roomId;
    playerId = null;
    currentState = null;
    constructor(client, roomId) {
        this.client = client;
        this.roomId = roomId;
        this.screen = blessed_1.default.screen({
            smartCSR: true,
            title: 'Terminal',
            fullUnicode: true,
        });
        // 假代码区域 - 占据屏幕大部分
        this.codeBox = blessed_1.default.box({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            style: {
                fg: '#6a9955',
                bg: '#1e1e1e',
            },
            tags: true,
            scrollable: true,
            alwaysScroll: true,
        });
        // 扑克信息浮窗 - 右下角最小化展示
        this.pokerBox = blessed_1.default.box({
            parent: this.screen,
            bottom: 1,
            right: 1,
            width: 45,
            height: 12,
            border: { type: 'line' },
            label: ' Console ',
            style: {
                fg: 'white',
                bg: '#1e1e1e',
                border: { fg: '#3c3c3c' },
            },
            tags: true,
        });
        this.client.onState((state) => {
            this.currentState = state;
            this.renderPoker();
        });
        this.client.onConnected((id) => {
            this.playerId = id;
        });
        this.client.onError((msg) => {
            // 在假代码中"悄悄"显示错误
            this.addCodeLine(`// ERROR: ${msg}`);
        });
        this.screen.key(['q', 'C-c'], () => {
            this.stopScroll();
            this.client.disconnect();
            process.exit(0);
        });
        this.screen.key(['f'], () => {
            this.client.action(this.roomId, 'fold');
            this.addCodeLine('// fold executed');
        });
        this.screen.key(['c'], () => {
            this.client.action(this.roomId, 'call');
            this.addCodeLine('// call executed');
        });
        this.screen.key(['r'], () => {
            this.showRaisePrompt();
        });
        this.screen.key(['p'], () => {
            this.showProfilePrompt();
        });
        this.screen.key(['s'], () => {
            this.client.startGame(this.roomId);
            this.addCodeLine('// game started');
        });
        this.initFakeCode();
        this.screen.render();
    }
    initFakeCode() {
        // 初始化填充屏幕的假代码
        for (let i = 0; i < 200; i++) {
            this.codeLines.push(this.generateCodeLine());
        }
        this.renderCode();
        // 开始滚动
        this.scrollInterval = setInterval(() => {
            this.codeLines.shift();
            this.codeLines.push(this.generateCodeLine());
            this.renderCode();
        }, 300 + Math.random() * 400);
    }
    stopScroll() {
        if (this.scrollInterval) {
            clearInterval(this.scrollInterval);
            this.scrollInterval = null;
        }
    }
    generateCodeLine() {
        const idx = Math.floor(Math.random() * FAKE_CODE_SNIPPETS.length);
        const line = FAKE_CODE_SNIPPETS[idx];
        // 随机添加缩进，看起来像真实代码
        const indent = Math.random() > 0.6 ? '  ' : '';
        const indent2 = Math.random() > 0.8 ? '  ' : '';
        return indent + indent2 + line;
    }
    addCodeLine(line) {
        this.codeLines.push(line);
        if (this.codeLines.length > 300) {
            this.codeLines.shift();
        }
        this.renderCode();
    }
    renderCode() {
        // 给代码添加语法高亮效果
        const highlighted = this.codeLines.map(line => {
            let colored = line
                .replace(/(import|export|const|let|var|function|class|return|await|async|if|else|try|catch|from)/g, '{#569cd6-fg}$1{/}')
                .replace(/(".*?"|'.*?'|`.*?`)/g, '{#ce9178-fg}$1{/}')
                .replace(/(\/\/.*)/g, '{#6a9955-fg}$1{/}')
                .replace(/(\b\d+\b)/g, '{#b5cea8-fg}$1{/}');
            return colored;
        });
        this.codeBox.setContent(highlighted.join('\n'));
        this.codeBox.setScrollPerc(100);
        this.screen.render();
    }
    showRaisePrompt() {
        const prompt = blessed_1.default.prompt({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 30,
            height: 5,
            border: { type: 'line' },
            label: ' Amount '
        });
        prompt.readInput('金额:', '', (err, value) => {
            if (!err && value) {
                const amount = parseInt(value, 10);
                if (!isNaN(amount)) {
                    this.client.action(this.roomId, 'raise', amount);
                    this.addCodeLine(`// raise to ${amount}`);
                }
            }
            this.screen.render();
        });
    }
    renderPoker() {
        const state = this.currentState;
        if (!state) {
            this.pokerBox.setContent('  等待连接...');
            this.screen.render();
            return;
        }
        const me = state.players.find(p => p.id === this.playerId);
        const isMyTurn = state.currentPlayerId === this.playerId;
        const phaseMap = {
            waiting: '等待',
            preflop: '翻前',
            flop: '翻牌',
            turn: '转牌',
            river: '河牌',
            showdown: '摊牌',
            ended: '结束',
        };
        const hand = me?.hand ? me.hand.join(' ') : '??';
        const community = state.communityCards.length > 0
            ? state.communityCards.map(c => c.display).join(' ')
            : '-';
        const content = [
            `  {bold}手牌:{/bold} ${hand}`,
            `  {bold}公共:{/bold} ${community}`,
            `  {bold}底池:{/bold} ${state.pot}  {bold}当前:{/bold} ${state.currentBet}`,
            `  {bold}阶段:{/bold} ${phaseMap[state.phase] || state.phase}`,
            `  {bold}筹码:{/bold} ${me?.chips ?? 0}`,
            isMyTurn ? '  {green-fg}{bold}▶ 轮到你了{/bold}{/green-fg}' : '  等待中...',
            '',
            '  f=弃牌 c=跟注 r=加注 s=开始 p=简介',
        ].join('\n');
        this.pokerBox.setContent(content);
        this.screen.render();
    }
    showProfilePrompt() {
        const profiles = this.getVisibleProfiles();
        if (profiles.length === 0) {
            this.addCodeLine('// 暂无玩家简介');
            return;
        }
        const list = blessed_1.default.list({
            parent: this.screen,
            border: { type: 'line' },
            width: '50%',
            height: Math.min(12, profiles.length + 4),
            top: 'center',
            left: 'center',
            label: ' Player Profiles ',
            keys: true,
            mouse: true,
            vi: true,
            items: profiles.map((profile) => profile.playerName),
            style: {
                selected: { bg: 'blue' },
            },
        });
        list.focus();
        this.screen.render();
        list.on('select', (_, index) => {
            const profile = profiles[Number(index)];
            list.destroy();
            this.showProfileCard(profile.playerName);
        });
    }
    getVisibleProfiles() {
        if (!this.currentState?.session)
            return [];
        if (this.currentState.session.viewerRole === 'gm' && this.currentState.session.gmProfiles) {
            return this.currentState.session.gmProfiles;
        }
        return this.currentState.session.publicProfiles;
    }
    showProfileCard(playerName) {
        const profile = this.getVisibleProfiles().find((item) => item.playerName === playerName);
        if (!profile)
            return;
        const lines = [
            `${profile.playerName} · ${profile.title}`,
            '',
            profile.summary,
            '',
            `近期: ${profile.recentNote}`,
            `标签: ${profile.revealedTraits.join(' / ') || '暂无'}`,
        ];
        if (this.isGmProfile(profile) && profile.soul) {
            lines.push('', `GM原型: ${profile.soul.archetypeName}`);
            lines.push(`GM标签: ${profile.soulTags.join(' / ') || '暂无'}`);
            lines.push('', profile.privateSummary);
        }
        const message = blessed_1.default.message({
            parent: this.screen,
            border: { type: 'line' },
            width: '70%',
            height: 16,
            top: 'center',
            left: 'center',
            label: ` ${playerName} `,
            tags: true,
        });
        message.display(lines.join('\n'), 0, () => {
            message.destroy();
            this.screen.render();
        });
    }
    isGmProfile(profile) {
        return 'privateSummary' in profile;
    }
}
exports.SlackerRenderer = SlackerRenderer;
