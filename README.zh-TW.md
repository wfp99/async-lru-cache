# Async LRU Cache

[![npm version](https://badge.fury.io/js/@wfp99%2Fasync-lru-cache.svg)](https://badge.fury.io/js/@wfp99%2Fasync-lru-cache)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/)

一個支援非同步載入和保存操作的 LRU（Least Recently Used）記憶體快取，自動處理並發請求。

## 特色

- 🚀 **非同步支援**：支援非同步的載入器（loader）和保存器（saver）函數
- 🔄 **自動合併**：自動合併相同 key 的並發 GET 請求
- 📝 **序列化寫入**：序列化同一 key 的 PUT 操作，確保順序執行
- 🗑️ **LRU 淘汰策略**：實現 LRU 演算法，自動移除最久未使用的項目
- ⏰ **TTL 支援**：支援可配置的生存時間（Time To Live），自動過期快取項目
- 🛡️ **錯誤處理**：完善的錯誤處理機制，失敗時自動清理快取
- 🧹 **完整清除**：支援一次性清除所有快取項目

## 為什麼選擇記憶體內快取而非外部快取服務？

**簡單性與效能**
- 無需設定 - 安裝後立即使用
- 零網路延遲 - 直接記憶體存取
- 減少基礎架構複雜性

**可靠性與開發**
- 無外部依賴或網路故障風險
- 簡化測試和除錯
- 無需 Redis、Memcached 或其他快取伺服器

## 安裝

```bash
npm install @wfp99/async-lru-cache
```

## 系統需求

- Node.js >= 14.0.0

## 使用方法

### 基本使用

```typescript
import { AsyncLRUCache } from '@wfp99/async-lru-cache';

// 創建一個最多容納 100 個項目的快取
const cache = new AsyncLRUCache({
    capacity: 100
});

// 使用 get 方法獲取資料
const data = await cache.get('user:123', async () => {
    // 快取未命中時執行的載入器函數
    const response = await fetch('/api/users/123');
    return response.json();
});

// 使用 put 方法儲存資料
await cache.put('user:456', userData, async (key, value) => {
    // 可選的保存器函數，用於持久化資料
    await saveToDatabase(key, value);
});
```

### 錯誤處理

```typescript
try {
    const data = await cache.get('problematic-key', async () => {
        throw new Error('載入失敗');
    });
} catch (error) {
    console.error('快取載入失敗:', error);
    // 失敗的項目會自動從快取中移除
}
```

### TTL（生存時間）支援

AsyncLRUCache 支援使用 TTL（Time To Live）自動過期快取項目：

```typescript
import { AsyncLRUCache } from '@wfp99/async-lru-cache';

// 建立支援 TTL 的快取
const cache = new AsyncLRUCache({
    capacity: 100,
    defaultTtlMs: 5000,        // 預設 TTL 為 5 秒
    cleanupIntervalMs: 10000   // 每 10 秒清理過期項目
});

// 使用預設 TTL
const data1 = await cache.get('key1', async () => {
    return await fetchData();
});

// 為特定項目覆寫 TTL
const data2 = await cache.get('key2', async () => {
    return await fetchCriticalData();
}, 30000); // 30 秒 TTL

// 使用自訂 TTL 進行 Put 操作
await cache.put('key3', value, async (key, val) => {
    await saveToDb(key, val);
}, 60000); // 1 分鐘 TTL

// 手動清理過期項目
cache.cleanupExpired();

// 檢查 key 是否存在且未過期
if (cache.has('key1')) {
    console.log('Key 存在且有效');
}

// 取得快取大小
console.log('目前快取大小:', cache.size());

// 銷毀快取（停止清理計時器並清除所有資料）
cache.destroy();
```

#### TTL 配置選項

- **`defaultTtlMs`**：所有快取項目的預設 TTL（可選）
- **`cleanupIntervalMs`**：過期項目的自動清理間隔（可選）
- 個別的 `get()` 和 `put()` 方法接受 TTL 覆寫
- 過期項目在正常操作期間會自動移除
- 呼叫 `cleanupExpired()` 進行手動清理
- 呼叫 `destroy()` 停止計時器並防止記憶體洩漏

### 進階使用

```typescript
// 與資料庫配合使用
const cache = new AsyncLRUCache<string, UserData>({ capacity: 500 });

// 從資料庫載入並自動快取
const user = await cache.get(`user:${userId}`, async () => {
    return await database.users.findById(userId);
});

// 原子性地保存到快取和資料庫
await cache.put(`user:${userId}`, updatedUser, async (key, value) => {
    await database.users.update(userId, value);
});
```

### 快取管理

```typescript
// 手動移除特定快取項目
cache.invalidate('user:123');

// 清除所有快取項目
cache.clear();
```

## API 參考

### `AsyncLRUCache<K, V>`

#### 建構函數

```typescript
constructor(option: AsyncLRUCacheOption)
```

#### `AsyncLRUCacheOption`

| 屬性 | 類型 | 必需 | 描述 |
|-----|------|------|------|
| `capacity` | `number` | 是 | 快取中允許的最大項目數量，必須為正數 |
| `defaultTtlMs` | `number` | 否 | 所有快取項目的預設 TTL（可選） |
| `cleanupIntervalMs` | `number` | 否 | 過期項目的自動清理間隔（可選） |

#### 方法

##### `get(key: K, loader: () => Promise<V>, ttlMs?: number): Promise<V>`

從快取中獲取資料。如果不存在，使用載入器載入資料。

- **key**: 快取鍵
- **loader**: 快取未命中時執行的非同步載入函數
- **ttlMs**: 此項目的可選 TTL 覆寫
- **回傳**: Promise，解析為所需的資料

##### `put(key: K, value: V, saver?: (key: K, value: V) => Promise<void>, ttlMs?: number): Promise<V>`

將值放入快取中，並可選擇性地執行保存器函數進行持久化。

- **key**: 快取鍵
- **value**: 要快取的值
- **saver**: 可選的非同步保存函數
- **ttlMs**: 此項目的可選 TTL 覆寫
- **回傳**: Promise，解析為保存操作完成後的最新值

##### `invalidate(key: K): void`

使指定鍵的快取項目失效並移除。

- **key**: 要失效的快取鍵

##### `clear(): void`

清除所有快取項目。此方法會移除快取中的所有項目並手動清理節點連結以避免潛在的記憶體洩漏。

##### `has(key: K): boolean`

檢查快取中是否存在指定鍵且未過期。

- **key**: 要檢查的快取鍵
- **回傳**: 如果鍵存在且有效則回傳 true

##### `size(): number`

回傳快取中目前的項目數量。

- **回傳**: 快取項目的數量

##### `cleanupExpired(): void`

手動從快取中移除過期項目。

##### `destroy(): void`

銷毀快取，停止清理計時器並清除所有資料。

## 並發處理

AsyncLRUCache 會自動處理並發操作：

- **GET 請求合併**：對同一 key 的多個並發請求會共享單一載入器執行
- **PUT 操作序列化**：對同一 key 的多個 PUT 操作會序列化執行以確保順序

```typescript
// 這三個並發請求會共享同一個載入器執行
const [data1, data2, data3] = await Promise.all([
    cache.get('shared-key', loader),
    cache.get('shared-key', loader),
    cache.get('shared-key', loader)
]);

// 這些操作會按順序執行，即使它們是並發啟動的
cache.put('key', 'value1', saver1);
cache.put('key', 'value2', saver2);
cache.put('key', 'value3', saver3);
```

## TypeScript 支援

此套件完全使用 TypeScript 編寫，提供完整的型別支援：

```typescript
interface User {
    id: string;
    name: string;
    email: string;
}

const userCache = new AsyncLRUCache<string, User>({
    capacity: 1000
});

const user: User = await userCache.get('user:123', async () => {
    // 載入器必須回傳 User 型別
    return fetchUserFromAPI('123');
});
```

## 錯誤處理

- **載入器失敗**：如果載入器函數拋出異常，對應的快取項目會被自動移除
- **保存器失敗**：如果保存器函數失敗，快取項目也會被移除，確保資料一致性
- **操作鏈錯誤**：PUT 操作會忽略前一個操作的錯誤，允許新操作繼續進行
- **錯誤日誌**：所有錯誤都會自動記錄到控制台，便於除錯

## 授權

MIT

## 貢獻

歡迎在 [GitHub](https://github.com/wfp99/async-lru-cache) 上提出問題和發送 Pull Request。

## 作者

Wang Feng Ping
