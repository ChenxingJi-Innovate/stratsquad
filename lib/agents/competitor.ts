import { runStreamed } from './_run'
import type { SSEWriter } from '../stream'

export async function runCompetitor(brief: string, sse: SSEWriter, attempt = 1): Promise<string> {
  const stricter = attempt > 1 ? '\n\n上一轮你的输出证据不足 / 论点空洞，本轮务必：每个论点带一个具体产品名 + 一个量化数据点（可估算，但必须给出数字范围）。' : ''
  const prompt = `你是资深游戏竞品分析师，过去 5 年做过《王者荣耀》《原神》《PUBG Mobile》这一级别产品的拆解。

任务简报：
"""
${brief}
"""

请围绕这个简报，产出一份结构化的竞品分析，包含：

# 一、相关产品矩阵
列出 3-5 款最相关的产品，每款给：发行商 / 上线时间 / 当前 DAU 量级 / 核心玩法 1 句话。

# 二、玩法拆解
对比这些产品在核心循环、付费点、社交 / 公会、PvP/PvE 平衡上的差异化策略。

# 三、商业化模式
ARPU / ARPPU 估算 (给出区间)、付费墙位置、皮肤 vs 角色卡池 vs 通行证的占比。

# 四、运营节奏
版本周期、活动密度、联动 IP 选择、KOL 与电竞投入。

# 五、给天美的可学习点
2-3 条最可迁移的策略，每条 1-2 句话，要具体到机制层面，不要"加强运营"这种空话。${stricter}

用 markdown 输出，800-1200 字。`

  return await runStreamed({ agent: 'competitor', prompt, sse, maxTokens: 2200 })
}
