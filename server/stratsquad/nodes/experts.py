"""The 4 expert sub-agent nodes: competitor, trend, market, risk.

Each takes the brief assigned to it by the orchestrator, optionally retries with a
stricter prompt on attempt > 1, and writes its markdown output back into the
state.outputs dict (merged by key via the reducer in state.py).

The trend node additionally consumes the RAG hits + live trend bundle so it can
ground its claims in real citations.
"""
from __future__ import annotations
from typing import Literal
from langgraph.config import get_stream_writer

from ..agent_runtime import run_streamed
from ..state import StratSquadState
from ..types import RagHit, TrendDataBundle, TrendResult


def _expert_attempt(state: StratSquadState, agent: Literal["competitor", "trend", "market", "risk"]) -> int:
    """Determine which attempt number this is. 2 if the agent is in the retry list."""
    retries = state.get("retries", []) or []
    return 2 if agent in retries else 1


def _brief_of(state: StratSquadState, agent: str) -> str:
    plan = state.get("plan", []) or []
    for sub in plan:
        if (sub.agent if hasattr(sub, "agent") else sub["agent"]) == agent:
            return sub.brief if hasattr(sub, "brief") else sub["brief"]
    return ""


# ─── competitor ──────────────────────────────────────────────────────────────
async def competitor_node(state: StratSquadState) -> dict:
    brief = _brief_of(state, "competitor")
    attempt = _expert_attempt(state, "competitor")
    stricter = (
        "\n\n上一轮你的输出证据不足 / 论点空洞，本轮务必：每个论点带一个具体产品名 + 一个量化数据点（可估算，但必须给出数字范围）。"
        if attempt > 1 else ""
    )
    prompt = f"""你是资深游戏竞品分析师，过去 5 年做过《王者荣耀》《原神》《PUBG Mobile》这一级别产品的拆解。

任务简报：
\"\"\"
{brief}
\"\"\"

请围绕这个简报，产出一份结构化的竞品分析，包含：

# 一、相关产品矩阵
列出 3-5 款最相关的产品，每款给：发行商 / 上线时间 / 当前 DAU 量级 / 核心玩法 1 句话。

# 二、玩法拆解
对比这些产品在核心循环、付费点、社交 / 公会、PvP/PvE 平衡上的差异化策略。

# 三、商业化模式
ARPU / ARPPU 估算 (给出区间)、付费墙位置、皮肤 vs 角色卡池 vs 通行证的占比。

# 四、运营节奏
版本周期、活动密度、联动 IP 选择、KOL 与电竞投入。

# 五、可学习点
2-3 条最可迁移的策略，每条 1-2 句话，要具体到机制层面，不要"加强运营"这种空话。{stricter}

用 markdown 输出，800-1200 字。"""
    content = await run_streamed(agent="competitor", prompt=prompt, max_tokens=2200)
    return {"outputs": {"competitor": content}}


# ─── trend (RAG + live-data-aware) ───────────────────────────────────────────
def _build_trend_block(bundle: TrendDataBundle | None) -> str:
    if not bundle or not bundle.results:
        return ""
    ok = [r for r in bundle.results if r.ok]
    failed = [r for r in bundle.results if not r.ok]
    if not ok:
        return ""
    blocks = "\n\n---\n\n".join(
        f"[来源 #T{r.source}] ({r.label}, 延时 {r.latency_ms}ms)\n{r.digest or ''}"
        for r in ok
    )
    failed_note = (
        f"\n\n(下列数据源未取到: " + "; ".join(f"{f.label} → {f.error}" for f in failed) + ")"
        if failed else ""
    )
    return f"\n\n## 实时趋势数据 (本轮采集)\n\n规划理由: {bundle.plan.rationale}\n\n{blocks}{failed_note}\n"


def _build_rag_block(hits: list[RagHit]) -> str:
    if not hits:
        return ""
    rows = "\n\n".join(
        f"[#{i+1}] (sim={h.score:.2f}, 来自 {h.source}{' · §' + h.heading if h.heading else ''})\n{h.text}"
        for i, h in enumerate(hits)
    )
    return f"\n\n## 参考资料 (静态语料库, 引用时标注 [来源 #N])\n{rows}\n"


async def trend_node(state: StratSquadState) -> dict:
    brief = _brief_of(state, "trend")
    attempt = _expert_attempt(state, "trend")
    stricter = (
        "\n\n上一轮论证空泛，本轮务必给出至少 3 个具体数字 (市场规模、增长率、用户量) 和 2 个具体技术 / 玩法事件 (例：UE5 Nanite 上线、AI NPC 在某产品落地)。"
        if attempt > 1 else ""
    )
    rag_block = _build_rag_block(state.get("rag_hits", []) or [])
    trend_block = _build_trend_block(state.get("trend_bundle"))

    prompt = f"""你是游戏行业趋势研究员，长期跟踪 Niko Partners / Sensor Tower / Newzoo / 伽马数据 / GameLook / 游戏葡萄，且能解读 Google Trends、Steam、Twitch、Reddit、YouTube、App Store、虎牙、斗鱼、B 站等公开数据。

任务简报：
\"\"\"
{brief}
\"\"\"
{rag_block}{trend_block}
请产出一份趋势研判，包含：

# 一、品类市场规模与增长
全球 / 中国 / 目标区域三档数据。优先引用上面"实时趋势数据"里的真实数字 (引用时标注 [来源 #Txxxx], 如 [来源 #Tgoogle-trends] [来源 #Tappstore])；其次引用静态语料 [来源 #N]；都没有的再用合理估算并标注 (估)。

# 二、玩家行为变化
近 18 个月内最值得注意的 2-3 个行为信号 (例：女性玩家在某品类占比变化、付费深度结构变化、内容消费方式变化)。引用实时趋势数据时务必标注来源。

# 三、技术 / 玩法驱动力
3 个正在重塑这个品类的技术或玩法趋势 (例：生成式 AI NPC、跨平台跨端、UGC 工具化)。每个给一个落地案例。

# 四、窗口期判断
给一个明确的判断："早期蓝海 / 中段红海 / 末段衰退"，并用 2-3 句论证。要至少引用一条实时趋势数据作为依据。{stricter}

用 markdown 输出，800-1200 字。"""
    content = await run_streamed(agent="trend", prompt=prompt, max_tokens=2400)
    return {"outputs": {"trend": content}}


# ─── market ──────────────────────────────────────────────────────────────────
async def market_node(state: StratSquadState) -> dict:
    brief = _brief_of(state, "market")
    attempt = _expert_attempt(state, "market")
    stricter = (
        "\n\n上一轮缺乏具体数据，本轮务必给出：人均 GDP 区间、移动游戏 ARPU 区间、主流支付渠道名字 (Boost / GCash / DANA / KaKaoPay 等)、主流买量平台 (TikTok Ads / Meta / Yandex 等)。"
        if attempt > 1 else ""
    )
    prompt = f"""你是出海发行策略专家，做过东南亚 / 中东 / 拉美 / 日韩 / 北美的本地化发行。

任务简报：
\"\"\"
{brief}
\"\"\"

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
给出一个推荐的"软启动城市 / 国家 → 全区 → 加码"路径，并标注预期投入量级。{stricter}

用 markdown 输出，800-1200 字。"""
    content = await run_streamed(agent="market", prompt=prompt, max_tokens=2200)
    return {"outputs": {"market": content}}


# ─── risk ────────────────────────────────────────────────────────────────────
async def risk_node(state: StratSquadState) -> dict:
    brief = _brief_of(state, "risk")
    attempt = _expert_attempt(state, "risk")
    stricter = (
        "\n\n上一轮风险点过于泛泛，本轮务必给出每条风险的：触发条件、影响级别 (高/中/低)、可观察的前置信号、缓解动作。"
        if attempt > 1 else ""
    )
    prompt = f"""你是游戏合规与政策风险分析师，熟悉中国 NPPA 版号、未成年人防沉迷、平台抽成 (苹果 30% / Google 30% / 国内安卓应用商店)、欧盟 DSA / GDPR、美国 COPPA、印尼 / 越南 / 沙特等地的内容审查规则。

任务简报：
\"\"\"
{brief}
\"\"\"

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
给出整体风险等级 (高/中/低) 与最关键的 3 个 must-watch 信号。{stricter}

用 markdown 输出，800-1200 字。"""
    content = await run_streamed(agent="risk", prompt=prompt, max_tokens=2200)
    return {"outputs": {"risk": content}}
