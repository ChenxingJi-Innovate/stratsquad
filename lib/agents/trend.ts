import { runStreamed } from './_run'
import type { RagHit } from '../rag/types'
import type { EventSink } from '../stream'
import type { TrendDataBundle, TrendResult } from '../trends/types'

function buildTrendBlock(bundle: TrendDataBundle | null): string {
  if (!bundle || bundle.results.length === 0) return ''
  const ok = bundle.results.filter((r): r is Extract<TrendResult, { ok: true }> => r.ok)
  const failed = bundle.results.filter(r => !r.ok)
  if (ok.length === 0) return ''

  const blocks = ok.map(r => `[来源 #T${r.source}] (${r.label}, 延时 ${r.latencyMs}ms)\n${r.digest}`).join('\n\n---\n\n')
  const failedNote = failed.length > 0
    ? `\n\n(下列数据源未取到: ${failed.map(f => `${f.label} → ${f.error}`).join('; ')})`
    : ''

  return `\n\n## 实时趋势数据 (本轮采集)\n\n规划理由: ${bundle.plan.rationale}\n\n${blocks}${failedNote}\n`
}

export async function runTrend(
  brief: string,
  hits: RagHit[],
  bundle: TrendDataBundle | null,
  sse: EventSink,
  attempt = 1,
): Promise<string> {
  const stricter = attempt > 1 ? '\n\n上一轮论证空泛，本轮务必给出至少 3 个具体数字 (市场规模、增长率、用户量) 和 2 个具体技术 / 玩法事件 (例：UE5 Nanite 上线、AI NPC 在某产品落地)。' : ''

  // RAG block (static corpus)
  const ragBlock = hits.length > 0
    ? `\n\n## 参考资料 (静态语料库, 引用时标注 [来源 #N])\n${
        hits.map((h, i) => `[#${i + 1}] (sim=${h.score.toFixed(2)}, 来自 ${h.source}${h.heading ? ` · §${h.heading}` : ''})\n${h.text}`).join('\n\n')
      }\n`
    : ''

  // Trend block (live fetched data) — separated from RAG so the agent knows what's recent vs cached.
  const trendBlock = buildTrendBlock(bundle)

  const prompt = `你是游戏行业趋势研究员，长期跟踪 Niko Partners / Sensor Tower / Newzoo / 伽马数据 / GameLook / 游戏葡萄，且能解读 Google Trends、Steam、Twitch、Reddit、YouTube、App Store、虎牙、斗鱼、B 站等公开数据。

任务简报：
"""
${brief}
"""
${ragBlock}${trendBlock}
请产出一份趋势研判，包含：

# 一、品类市场规模与增长
全球 / 中国 / 目标区域三档数据。优先引用上面"实时趋势数据"里的真实数字 (引用时标注 [来源 #Txxxx], 如 [来源 #Tgoogle-trends] [来源 #Tappstore])；其次引用静态语料 [来源 #N]；都没有的再用合理估算并标注 (估)。

# 二、玩家行为变化
近 18 个月内最值得注意的 2-3 个行为信号 (例：女性玩家在某品类占比变化、付费深度结构变化、内容消费方式变化)。引用实时趋势数据时务必标注来源。

# 三、技术 / 玩法驱动力
3 个正在重塑这个品类的技术或玩法趋势 (例：生成式 AI NPC、跨平台跨端、UGC 工具化)。每个给一个落地案例。

# 四、窗口期判断
给一个明确的判断："早期蓝海 / 中段红海 / 末段衰退"，并用 2-3 句论证。要至少引用一条实时趋势数据作为依据。${stricter}

用 markdown 输出，800-1200 字。`

  return await runStreamed({ agent: 'trend', prompt, sse, maxTokens: 2400 })
}
