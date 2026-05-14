import { runStreamed } from './_run'
import type { SSEWriter } from '../stream'

export async function runRisk(brief: string, sse: SSEWriter, attempt = 1): Promise<string> {
  const stricter = attempt > 1 ? '\n\n上一轮风险点过于泛泛，本轮务必给出每条风险的：触发条件、影响级别 (高/中/低)、可观察的前置信号、缓解动作。' : ''
  const prompt = `你是游戏合规与政策风险分析师，熟悉中国 NPPA 版号、未成年人防沉迷、平台抽成 (苹果 30% / Google 30% / 国内安卓应用商店)、欧盟 DSA / GDPR、美国 COPPA、印尼 / 越南 / 沙特等地的内容审查规则。

任务简报：
"""
${brief}
"""

请产出一份风险清单，包含 4 类风险，每类至少 2 条具体条目：

# 一、版号 / 牌照
中国版号节奏、目标海外区域是否需要 publisher license (例：韩国 GRAC、印尼 PSE 备案、沙特 GAMES committee)。

# 二、平台与抽成
App Store / Google Play 抽成、第三方应用商店分发、绕过抽成的法律边界 (web shop、Direct Pay) 的可行性与风险。

# 三、内容与文化
宗教 / 政治 / 性别表达 / 暴力 / 赌博机制 (开箱算不算赌博)、未成年人保护 (中国防沉迷、欧盟 DSA、美国 COPPA)。

# 四、数据与隐私
玩家数据跨境 (PIPL / GDPR)、SDK 与第三方数据收集、玩家身份认证要求。

# 五、综合风险等级
给出整体风险等级 (高/中/低) 与最关键的 3 个 must-watch 信号。${stricter}

用 markdown 输出，800-1200 字。`

  return await runStreamed({ agent: 'risk', prompt, sse, maxTokens: 2200 })
}
