import { runStreamed } from './_run'
import type { SSEWriter } from '../stream'

export async function runMarket(brief: string, sse: SSEWriter, attempt = 1): Promise<string> {
  const stricter = attempt > 1 ? '\n\n上一轮缺乏具体数据，本轮务必给出：人均 GDP 区间、移动游戏 ARPU 区间、主流支付渠道名字 (Boost / GCash / DANA / KaKaoPay 等)、主流买量平台 (TikTok Ads / Meta / Yandex 等)。' : ''
  const prompt = `你是出海发行策略专家，做过东南亚 / 中东 / 拉美 / 日韩 / 北美的本地化发行。

任务简报：
"""
${brief}
"""

请产出一份区域市场评估，包含：

# 一、市场画像
目标区域的关键宏观指标：人口、智能手机普及率、人均 GDP、互联网渗透率。给出量级即可。

# 二、玩家与付费习惯
- 主流年龄段与性别比例
- 移动游戏 ARPU / 付费率区间
- 主流付费方式 (信用卡 / 电子钱包 / 运营商代扣 / 礼品卡)，至少点名 3 个本地支付品牌

# 三、本地化难度
语言 / 文化 / 美术 / 配音 / 客服 / 审核 6 个维度，每个 1-2 句话评估难度并给出建议。

# 四、获客渠道
排名前 3 的买量平台、KOL 生态、应用商店分布 (Google Play vs 第三方)、电竞 / 直播平台。

# 五、上线节奏建议
给出一个推荐的"软启动城市 / 国家 → 全区 → 加码"路径，并标注预期投入量级。${stricter}

用 markdown 输出，800-1200 字。`

  return await runStreamed({ agent: 'market', prompt, sse, maxTokens: 2200 })
}
