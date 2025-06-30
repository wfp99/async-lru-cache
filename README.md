# Async LRU Cache

[![npm version](https://badge.fury.io/js/@wfp99%2Fasync-lru-cache.svg)](https://badge.fury.io/js/@wfp99%2Fasync-lru-cache)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/)

An asynchronous LRU (Least Recently Used) memory cache that supports asynchronous loading and saving operations while automatically handling concurrent requests.

## Features

- 🚀 **Async Support**: Supports asynchronous loader and saver functions
- 🔄 **Automatic Merging**: Automatically merges concurrent GET requests for the same key
- 📝 **Serialized Writes**: Serializes PUT operations for the same key to ensure execution order
- 🗑️ **LRU Eviction**: Implements LRU algorithm to automatically remove least recently used items
- 🛡️ **Error Handling**: Comprehensive error handling with automatic cache cleanup on failures
- 🧹 **Complete Clearing**: Support for clearing all cache entries at once

## Installation

```bash
npm install @wfp99/async-lru-cache
```

## Requirements

- Node.js >= 14.0.0

## Usage

### Basic Usage

```typescript
import { AsyncLRUCache } from '@wfp99/async-lru-cache';

// Create a cache with maximum 100 items
const cache = new AsyncLRUCache({
    capacity: 100
});

// Use get method to retrieve data
const data = await cache.get('user:123', async () => {
    // Loader function executed on cache miss
    const response = await fetch('/api/users/123');
    return response.json();
});

// Use put method to store data
await cache.put('user:456', userData, async (key, value) => {
    // Optional saver function for data persistence
    await saveToDatabase(key, value);
});
```

### Error Handling

```typescript
try {
    const data = await cache.get('problematic-key', async () => {
        throw new Error('Load failed');
    });
} catch (error) {
    console.error('Cache load failed:', error);
    // Failed items are automatically removed from cache
}
```

### Advanced Usage

```typescript
// Working with database
const cache = new AsyncLRUCache<string, UserData>({ capacity: 500 });

// Load from database with automatic caching
const user = await cache.get(`user:${userId}`, async () => {
    return await database.users.findById(userId);
});

// Save to cache and database atomically
await cache.put(`user:${userId}`, updatedUser, async (key, value) => {
    await database.users.update(userId, value);
});
```

### Cache Management

```typescript
// Manually remove specific cache entry
cache.invalidate('user:123');

// Clear all cache entries
cache.clear();
```

## API Reference

### `AsyncLRUCache<K, V>`

#### Constructor

```typescript
constructor(option: AsyncLRUCacheOption)
```

#### `AsyncLRUCacheOption`

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `capacity` | `number` | Yes | Maximum number of items allowed in cache. Must be a positive number. |

#### Methods

##### `get(key: K, loader: () => Promise<V>): Promise<V>`

Retrieves data from cache. If not found, uses the loader to load data.

- **key**: Cache key
- **loader**: Asynchronous loader function executed on cache miss
- **Returns**: Promise that resolves to the required data

##### `put(key: K, value: V, saver?: (key: K, value: V) => Promise<void>): Promise<V>`

Puts a value into cache and optionally executes a saver function for persistence.

- **key**: Cache key
- **value**: Value to cache
- **saver**: Optional asynchronous saver function
- **Returns**: Promise that resolves to the latest value after saver operation completes

##### `invalidate(key: K): void`

Invalidates and removes the cache entry for the specified key.

- **key**: Cache key to invalidate

##### `clear(): void`

Clears all cache entries. This method removes all items from cache and manually clears node links to prevent potential memory leaks.

## Concurrency Handling

### GET Request Merging

When multiple concurrent requests fetch the same key, AsyncLRUCache automatically merges these requests, ensuring the loader function executes only once:

```typescript
// These three concurrent requests will share the same loader execution
const [data1, data2, data3] = await Promise.all([
    cache.get('shared-key', loader),
    cache.get('shared-key', loader),
    cache.get('shared-key', loader)
]);
```

### PUT Operation Serialization

Multiple PUT operations for the same key are serialized to ensure they execute in order:

```typescript
// These operations will execute sequentially, even if started concurrently
cache.put('key', 'value1', saver1);
cache.put('key', 'value2', saver2);
cache.put('key', 'value3', saver3);
```

## TypeScript Support

This package is fully written in TypeScript and provides complete type support:

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
    // Loader must return User type
    return fetchUserFromAPI('123');
});
```

## Error Handling

- **Loader Failures**: If loader function throws an exception, corresponding cache entry is automatically removed
- **Saver Failures**: If saver function fails, cache entry is also removed to ensure data consistency
- **Operation Chain Errors**: PUT operations ignore previous operation errors, allowing new operations to proceed
- **Error Logging**: All errors are automatically logged to console for debugging

## Memory Management

AsyncLRUCache provides comprehensive memory management:

- **Automatic Eviction**: Automatically removes least recently used items based on capacity
- **Manual Cleanup**: `clear()` method thoroughly cleans all node links to prevent memory leaks
- **Error Cleanup**: Automatically cleans related cache entries when operations fail

## License

MIT

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/wfp99/async-lru-cache).

## Author

Wang Feng Ping
