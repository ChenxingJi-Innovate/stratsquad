import { runStreamed } from './_run'
import type { RagHit } from '../rag/types'
import type { EventSink } from '../stream'

export async function runTrend(brief: string, hits: RagHit[], sse: EventSink, attempt = 1): Promise<string> {
  const stricter = attempt > 1 ? '\n\n上一轮论证空泛，本轮务必给出至少 3 个具体数字 (市场规模、增长率、用户量) 和 2 个具体技术 / 玩法事件 (例：UE5 Nanite 上线、AI NPC 在某产品落地)。' : ''

  // Top-k retrieved chunks become structured citations. Each one carries [#N] so the model
  // (and the reader) can trace claims back to a source.
  const ragBlock = hits.length > 0
    ? `\n\n参考资料 (按相关度排序，引用某条事实请在句尾标注 [来源 #N])：\n${
        hits.map((h, i) => `[#${i + 1}] (sim=${h.score.toFixed(2)}, 来自 ${h.source}${h.heading ? ` · §${h.heading}` : ''})\n${h.text}`).join('\n\n')
      }\n`
    : ''

  const prompt = `你是游戏行业趋势研究员，长期跟踪 Niko Partners / Sensor Tower / Newzoo / 伽马数据 / GameLook / 游戏葡萄。

任务简报：
"""
${brief}
"""
${ragBlock}
请产出一份趋势研判，包含：

# 一、品类市场规模与增长
全球 / 中国 / 目标区域三档数据，给出年度量级 (美元) 和近 3 年 CAGR 估算。**优先引用参考资料里的数字**，并在句尾标注 [来源 #N]；参考资料没有的数据再用合理估算并标注 (估)。

# 二、玩家行为变化
近 18 个月内最值得注意的 2-3 个行为信号 (例：女性玩家在某品类占比变化、付费深度结构变化、内容消费方式变化)。

# 三、技术 / 玩法驱动力
3 个正在重塑这个品类的技术或玩法趋势 (例：生成式 AI NPC、跨平台跨端、UGC 工具化)。每个给一个落地案例。

# 四、窗口期判断
给一个明确的判断：当前是"早期蓝海 / 中段红海 / 末段衰退"，并用 2-3 句话论证。${stricter}

用 markdown 输出，800-1200 字。`

  return await runStreamed({ agent: 'trend', prompt, sse, maxTokens: 2200 })
}
