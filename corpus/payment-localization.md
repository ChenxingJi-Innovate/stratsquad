# 海外支付本地化与买量渠道指南

## 支付方式分布（按区域）

不同区域玩家的偏好支付方式差异极大，做本地化决定了能不能把流量真正"转化成钱"。

### 东南亚

| 国家 | 主流支付（覆盖度 60%+） | 次要支付 |
|------|------------------------|----------|
| 印尼 | GoPay, OVO, DANA, ShopeePay | 银行转账（Mandiri / BCA Virtual Account）、运营商代扣（Telkomsel） |
| 越南 | Momo Pay | ZaloPay, ViettelPay, Visa/MasterCard |
| 菲律宾 | GCash, Maya | 7-Eleven 充值卡, GrabPay |
| 泰国 | True Money, Rabbit LINE Pay | PromptPay（QR）、信用卡 |
| 马来西亚 | Boost, Touch'n Go eWallet | 信用卡, FPX 银行转账 |
| 新加坡 | 信用卡, GrabPay | PayNow（QR） |

### 中东

- **沙特 / 阿联酋 / 卡塔尔**：STC Pay（沙特电信钱包）、信用卡、运营商代扣（Mobily / Etisalat）
- **埃及**：Fawry 现金充值占 50%+，Vodafone Cash 次之
- **土耳其**：本地银行卡（Garanti / Akbank）、TosPay

### 拉美

- **巴西**：Pix（即时支付）覆盖 70%+，Boleto 现金充值占长尾，信用卡（含分期）
- **墨西哥**：OXXO 便利店现金充值占 35%，信用卡 + SPEI 转账
- **阿根廷**：MercadoPago（含 12 期分期）

### 日韩

- **日本**：信用卡（VISA / JCB / AMEX）、运营商代扣（DoCoMo / au / SoftBank）、PayPay、Apple/Google ID 卡
- **韩国**：KaKaoPay、Naver Pay、信用卡、Toss Pay

### 北美 / 欧洲

- 信用卡为主（占 70%+）
- 数字钱包补充：PayPal, Apple Pay, Google Pay
- 礼品卡分发：Walmart, Target, Tesco, Carrefour 等

## 接入策略

主流游戏支付聚合 SDK：
- **Xsolla**：覆盖 200+ 国家，700+ 支付方式，抽成 5-10%
- **Adyen**：企业级，覆盖广，定价透明，适合大体量
- **Codapay**：东南亚 + 中东，本地化深，抽成 2-5%
- **Skrill / Razer Gold**：游戏行业特化的预付费钱包

通常做法是：
1. 先用 Xsolla 或 Codapay 快速覆盖 80% 支付方式
2. 上线后 6 个月跑数据，发现大流量国家再单独接本地支付（如印尼直接接 GoPay SDK，省抽成）

## 买量渠道（2025 SEA 视角）

按 CPM 性价比从高到低：

| 渠道 | SEA CPM (USD) | 适用品类 | 备注 |
|------|---------------|---------|------|
| TikTok Ads | 0.8-2.5 | 休闲 / 中度 / MOBA | 增长最快，2024-2025 SEA 投放占比超过 Meta |
| Meta (Facebook + IG) | 1.5-4.0 | 全品类 | 老牌主力，定向工具最成熟 |
| Google Ads (UAC) | 2.0-5.0 | 全品类 | 算法黑盒程度高，预算门槛低 |
| AppLovin | 2.5-6.0 | 休闲为主 | 视频创意主导 |
| Unity Ads | 2.0-4.5 | 休闲 / 中度 | 与 Unity 引擎深度集成 |
| 本地 KOL | 视情况 | 全品类，MOBA / 二次元尤佳 | 印尼 Tiktoker 万粉报价 50-150 美元 |
| Twitch / YouTube 主播 | 视情况 | 重度 / 电竞 | 单主播日预算 500-5000 美元 |

KOL 投放在 SEA 比传统买量 ROI 平均高 30-50%，但运营成本高（需要本地团队对接、合同管理、效果监测）。建议同时跑 TikTok + 本地 KOL + Meta 三条腿。

## 客服与社区

- 客服至少印尼语 / 越南语 / 泰语 / 英语四语种，可用 Helpshift / Zendesk + 翻译 API 起步，6 个月后看流量决定是否本地化人工客服
- 社区运营优先 Discord（拉美 + 西方）、Telegram（中东 + 部分 SEA）、LINE（日 / 泰 / 台）、KakaoTalk（韩）
- 中东市场建议保留 WhatsApp 客服通道

## 本地化避坑清单

- 印尼：避免猪 / 酒精相关美术元素（穆斯林人口占 87%）
- 沙特：女性角色服装需保守，禁止裸露和性暗示
- 越南：避免与南海主权 / 历史敏感事件相关地图设计
- 泰国：避免王室元素，红 / 黄色谨慎使用
- 韩国：抽卡概率公示比中国更严，主播文化深，需配合 Streamer 运营
- 巴西：注意葡萄牙语（巴西本地）与葡萄牙葡语差异，机翻不可用
