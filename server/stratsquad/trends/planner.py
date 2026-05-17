"""LLM-driven planner that picks which trend sources to query, region-aware,
and respects the user's enabled_sources allowlist.
"""
from __future__ import annotations
from langgraph.config import get_stream_writer

from ..agent_runtime import run_json
from ..types import TrendQueryPlan, TrendQuery, TrendSource


ALL_SOURCES: list[TrendSource] = [
    "google-trends", "steam", "twitch", "youtube",
    "appstore", "huya", "douyu", "bilibili",
]


KNOWN_HUYA = ["lol", "英雄联盟", "王者荣耀", "dota2", "永劫无间", "原神", "apex", "绝地求生", "和平精英",
              "英雄联盟手游", "逆水寒", "使命召唤", "我的世界", "梦幻西游", "战地"]
KNOWN_DOUYU = ["lol", "英雄联盟", "王者荣耀", "dota2", "原神", "apex", "绝地求生", "永劫无间",
               "和平精英", "逆水寒", "英雄联盟手游", "我的世界", "使命召唤", "梦幻西游"]
KNOWN_BILIBILI = ["lol", "英雄联盟", "原神", "王者荣耀", "apex", "永劫无间", "使命召唤手游",
                  "和平精英", "蛋仔派对", "minecraft", "我的世界"]


SOURCE_DESC: dict[TrendSource, str] = {
    "google-trends": "google-trends - 全球关键词搜索热度，可选 region (US/JP/KR/ID/VN/PH/TH/MY/SG/TW/HK/GB/FR/DE/CN/WW)、timeframe (默认 \"today 12-m\")。返回相对值 0-100。",
    "steam": "steam - PC 游戏当前在玩量。可传 gameTitles 查指定游戏，或不传查 Top 10。",
    "twitch": "twitch - 海外直播品类热度。需要 gameTitles 或不传查 Top 10。Twitch 在中国大陆无用，不要为中国市场问题选这个。",
    "youtube": "youtube - 视频热度。需要 keywords，可选 region (默认 US)。",
    "appstore": "appstore - iOS App Store 游戏榜。需要 region (国家二字代码如 us/cn/jp/kr/id/vn/ph/sg/th)。**中国相关问题必带 region=cn**。",
    "huya": f"huya - 中国虎牙直播。需要 category (取值之一: {', '.join(KNOWN_HUYA)})。海外问题不要选。",
    "douyu": f"douyu - 中国斗鱼直播。需要 category (取值之一: {', '.join(KNOWN_DOUYU)})。海外问题不要选。",
    "bilibili": f"bilibili - 哔哩哔哩。两种用法之一: 传 category (取值之一: {', '.join(KNOWN_BILIBILI)}) 查直播; 或传 keywords 查视频。",
}


async def run_trend_planner(
    trend_brief: str,
    question: str,
    enabled_sources: list[TrendSource] | None,
) -> TrendQueryPlan:
    allowed = set(enabled_sources) if enabled_sources else set(ALL_SOURCES)
    allowed_list = [s for s in ALL_SOURCES if s in allowed]
    if not allowed_list:
        plan = TrendQueryPlan(rationale="用户禁用了全部数据源。", queries=[])
        writer = get_stream_writer()
        writer({"type": "trend_plan", "plan": plan.model_dump(by_alias=True)})
        return plan

    source_block = "\n".join(SOURCE_DESC[s] for s in allowed_list)
    constraint = (
        f"\n注意：用户限定本次只能使用以下 {len(allowed_list)} 个源: {', '.join(allowed_list)}。不要选其他源。"
        if enabled_sources and len(enabled_sources) < len(ALL_SOURCES) else ""
    )

    system = f"""你是数据采集规划器。给定一个游戏行业战略问题与对应的"行业趋势"子简报，你要决定从哪些公开数据源采集证据。

可用数据源:

{source_block}
{constraint}

规则:
- **默认尽可能多选**(用户允许的源里选 6-8 个)。游戏行业战略问题几乎总是跨区域:头部产品 (王者荣耀/原神/MLBB/PUBG) 同时在中国与海外运营,任何战略决策都需要双侧数据交叉验证。
- **基线 (任何问题都要包含)**:
  · appstore region=cn (中国 iOS 榜单 — 即使是海外问题,中国头部产品的中国市场表现也是关键对照)
  · huya + douyu + bilibili 至少两个 (按游戏 category 取舍;不在已知列表内的就跳过)
  · appstore 海外区域 (us / jp / kr / 东南亚国家之一)
- **海外问题加选**: google-trends 对应区域 + twitch + youtube
- **中国为主问题加选**: google-trends region=CN + 上述基线
- **跨区域问题**: 基线 + google-trends 海外区域 + youtube + twitch
- 中国直播平台 (虎牙/斗鱼/B站) 是游戏行业最重要的实时风向标之一,不要因为问题"是海外的"就完全不选。
- 关键词用中英对照。给中国市场的关键词用中文，给海外的用英文。
- gameTitles 用游戏的英文常用名 (Mobile Legends, Honor of Kings, Genshin Impact 等)。
- huya/douyu/bilibili 的 category 必须严格在上面列表里，否则跳过这个源。

输出 JSON 格式:
{{
  "rationale": "一段话说明你为什么选这些源 (中文, 50-150 字)",
  "queries": [
    {{"source": "google-trends", "keywords": ["MOBA mobile", "Honor of Kings"], "region": "ID", "timeframe": "today 12-m"}},
    {{"source": "twitch", "gameTitles": ["Mobile Legends: Bang Bang"]}}
  ]
}}

只输出 JSON，不要任何其他文字。"""

    user = f'战略问题: "{question}"\n\n趋势子简报: """{trend_brief}"""\n\n请输出查询计划。'
    parsed = await run_json(
        agent="trend",   # piggy-backs on trend channel (silent mode prevents UI agent_start/done leak)
        prompt=user, system=system,
        max_tokens=1200, silent=True,
    )
    raw_queries = parsed.get("queries", []) or []
    clean: list[TrendQuery] = []
    for q in raw_queries:
        if not isinstance(q, dict) or q.get("source") not in allowed:
            continue
        if q["source"] == "huya":
            cat = (q.get("category") or "").lower()
            if not cat or cat not in KNOWN_HUYA:
                continue
        if q["source"] == "douyu":
            cat = (q.get("category") or "").lower()
            if not cat or cat not in KNOWN_DOUYU:
                continue
        if q["source"] == "bilibili":
            cat = (q.get("category") or "").lower()
            if cat and cat not in KNOWN_BILIBILI:
                q.pop("category", None)
        # Pydantic aliases: incoming JSON uses camelCase
        try:
            clean.append(TrendQuery.model_validate(q))
        except Exception:
            continue

    plan = TrendQueryPlan(rationale=parsed.get("rationale", "采集计划由趋势规划器自动生成。"), queries=clean)
    writer = get_stream_writer()
    writer({"type": "trend_plan", "plan": plan.model_dump(by_alias=True, exclude_none=True)})
    return plan
