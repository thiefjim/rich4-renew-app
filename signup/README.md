# rich4 測試報名 Worker

https://rich4-signup.thiefjim.workers.dev — 邀請碼把關的測試報名頁。只做內部測試（TestFlight 內部群組、Play 內部測試）。

- iPhone：送出後 Worker 用 ASC API 寄「加入 App Store Connect 團隊」邀請（Customer Support 角色、只看得到 rich4）。cron 每 10 分鐘檢查，對方接受後自動加進 TestFlight 內部群組「內部測試」。
- Android：只記錄，並寄通知信到 thiefjim@gmail.com（`send_email` binding，寄件網域 tappedia.com 的 Email Routing）。**手動步驟**：到 `/admin` 複製待處理 email → 貼進 Play Console 內部測試 email 名單「Dev」→ 按「完成」→ 通知對方開 opt-in 連結。

紀錄存在 KV，30 天後自動過期。

## 指令

```sh
npm install
npm test          # node assert：邀請碼、驗證、跳脫
npm run check     # tsc
npm run deploy
```

## Secrets

`INVITE_CODE`、`ADMIN_TOKEN`、`ASC_PRIVATE_KEY`（.p8 內容）、`ASC_KEY_ID`、`ASC_ISSUER_ID`。目前值記在 repo 外的 `../build/signup-secrets.txt`。

```sh
npx wrangler secret put INVITE_CODE                       # 互動輸入
npx wrangler secret put ASC_PRIVATE_KEY < path/to/AuthKey_XXXX.p8
```

## 管理頁

`/admin?token=<ADMIN_TOKEN>`：列出報名、Android 標記完成/刪除、「立即同步 iOS」（與 cron 相同）。
