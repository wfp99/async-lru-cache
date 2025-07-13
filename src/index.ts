/**
 * Asynchronous LRU Cache.
 * Supports asynchronous load and save operations, and automatically handles concurrent requests.
 * Uses the LRU strategy to evict the oldest items.
 *
 * @module AsyncLRUCache
 */

/**
 * Node of the linked list, where value is a Promise representing the eventual data value.
 */
class Node<K, V>
{
	/**
	 * Reference to the next node in the linked list.
	 * This property is `null` if there is no next node.
	 */
	public next: Node<K, V> | null = null;

	/**
	 * Reference to the previous node in the linked list.
	 * This property is `null` if there is no previous node.
	 */
	public prev: Node<K, V> | null = null;

	/**
	 * The key associated with this node.
	 */
	public key: K;

	/**
	 * The value of this node, which is a Promise that resolves to the actual data.
	 */
	public value: Promise<V>;

	/**
	 * The timestamp when this node expires (in milliseconds).
	 * If null, the node never expires.
	 */
	public expiresAt: number | null = null;

	/**
	 * Creates a new Node instance.
	 * @param key - The key associated with this node.
	 * @param value - A Promise that resolves to the value of this node.
	 * @param ttlMs - Time to live in milliseconds. If provided, sets the expiration time.
	 */
	constructor(key: K, value: Promise<V>, ttlMs?: number)
	{
		this.key = key;
		this.value = value;

		if (ttlMs !== undefined && ttlMs > 0)
		{
			this.expiresAt = Date.now() + ttlMs;
		}
	}

	/**
	 * Checks if this node has expired.
	 * @returns True if the node has expired, false otherwise.
	 */
	public isExpired(): boolean
	{
		return this.expiresAt !== null && Date.now() > this.expiresAt;
	}
}

/**
 * Configuration options for the AsyncLRUCache.
 */
export interface AsyncLRUCacheOption
{
	/**
	 * Maximum capacity of the cache, this is the maximum number of items allowed.
	 * Must not be less than 10.
	 */
	capacity: number;

	/**
	 * Default time to live for cache entries in milliseconds.
	 * If not specified, entries will not expire automatically.
	 * Individual entries can override this value.
	 */
	defaultTtlMs?: number;

	/**
	 * Interval in milliseconds for automatic cleanup of expired entries.
	 * If not specified, cleanup will only happen during normal operations.
	 * Setting this enables periodic background cleanup.
	 */
	cleanupIntervalMs?: number;
}

/**
 * Asynchronous LRU Cache class.
 * - Supports asynchronous loaders for data fetching.
 * - Supports asynchronous savers for data persistence.
 * - Automatically merges concurrent requests (get) and serializes writes (put).
 * - Implements LRU eviction strategy.
 * - Supports TTL (Time To Live) for automatic expiration of entries.
 */
export class AsyncLRUCache<K, V>
{
	/**
	 * Maximum capacity of the cache.
	 */
	private readonly capacity: number;

	/**
	 * Default TTL for cache entries in milliseconds.
	 */
	private readonly defaultTtlMs?: number;

	/**
	 * Map for storing cache entries. The key is the cache key, and the value is the Node.
	 */
	private dataMap = new Map<K, Node<K, V>>();

	/**
	 * Head node of the linked list, pointing to the most recently used item.
	 */
	private head: Node<K, V> | null = null;

	/**
	 * Tail node of the linked list, pointing to the least recently used item.
	 */
	private tail: Node<K, V> | null = null;

	/**
	 * Timer ID for periodic cleanup of expired entries.
	 */
	private cleanupTimer?: NodeJS.Timeout;

	/**
	 * Creates an instance of AsyncLRUCache with the specified options.
	 * @param option - The configuration options for the cache.
	 * @throws {Error} Throws an error if the provided capacity is less than 10.
	 */
	constructor(option: AsyncLRUCacheOption)
	{
		if (option.capacity < 10)
			throw new Error("Capacity must be at least 10.");

		this.capacity = option.capacity;
		this.defaultTtlMs = option.defaultTtlMs;

		// Setup periodic cleanup if specified
		if (option.cleanupIntervalMs && option.cleanupIntervalMs > 0)
		{
			this.cleanupTimer = setInterval(() => {
				this._cleanupExpired();
			}, option.cleanupIntervalMs);
		}
	}

	/**
	 * Cleans up expired entries from the cache.
	 * This method removes all nodes that have exceeded their TTL.
	 */
	private _cleanupExpired(): void
	{
		const expiredKeys: K[] = [];

		// Collect expired keys
		for (const [key, node] of this.dataMap)
		{
			if (node.isExpired())
			{
				expiredKeys.push(key);
			}
		}

		// Remove expired entries
		for (const key of expiredKeys)
		{
			const node = this.dataMap.get(key);
			if (node)
			{
				this.dataMap.delete(key);
				this._removeNode(node);
			}
		}
	}

	/**
	 * Checks if a node is expired and removes it if so.
	 * @param key - The key to check.
	 * @param node - The node to check.
	 * @returns True if the node was expired and removed, false otherwise.
	 */
	private _checkAndRemoveExpired(key: K, node: Node<K, V>): boolean
	{
		if (node.isExpired())
		{
			this.dataMap.delete(key);
			this._removeNode(node);
			return true;
		}
		return false;
	}

	/**
	 * Checks if eviction is needed according to the cache strategy.
	 * When the cache exceeds its capacity, automatically removes the tail (least recently used) node.
	 */
	private _evictIfNeeded(): void
	{
		if (this.dataMap.size > this.capacity)
		{
			this.dataMap.delete(this.tail!.key);
			this._removeNode(this.tail!);
		}
	}

	/**
	 * Moves the specified node to the head of the linked list.
	 * This operation is used to mark a node as most recently used.
	 * @param node - The node to move to the head of the list.
	 */
	private _moveToHead(node: Node<K, V>): void
	{
		if (node === this.head)
			return;
		this._removeNode(node);
		this._addToHead(node);
	}

	/**
	 * Removes a node from the doubly linked list used by the cache.
	 * Updates the previous and next pointers of adjacent nodes to unlink the specified node.
	 * @param node - The node to remove from the list.
	 */
	private _removeNode(node: Node<K, V>): void
	{
		if (node.prev)
			node.prev.next = node.next;
		else
			this.head = node.next;

		if (node.next)
			node.next.prev = node.prev;
		else
			this.tail = node.prev;
	}

	/**
	 * Adds the given node to the head (front) of the doubly linked list.
	 * @param node - The node to add to the head of the list.
	 */
	private _addToHead(node: Node<K, V>): void
	{
		node.prev = null;
		node.next = this.head;
		if (this.head)
			this.head.prev = node;

		this.head = node;
		if (!this.tail)
			this.tail = node;
	}

	/**
	 * Retrieves data from the cache. If it does not exist, uses the loader to load it.
	 * Automatically merges concurrent requests for the same key.
	 * @param key - Cache key.
	 * @param loader - Asynchronous loader function to execute on cache miss.
	 * @param ttlMs - Optional TTL override for this entry in milliseconds.
	 * @returns A Promise that resolves to the required data.
	 */
	public get(key: K, loader: () => Promise<V>, ttlMs?: number): Promise<V>
	{
		const node = this.dataMap.get(key);

		if (node)
		{
			// Check if the node has expired
			if (this._checkAndRemoveExpired(key, node))
			{
				// Node was expired and removed, proceed to load fresh data
			}
			else
			{
				this._moveToHead(node);
				return node.value;
			}
		}

		const loadingPromise = loader();
		const effectiveTtlMs = ttlMs ?? this.defaultTtlMs;
		const newNode = new Node(key, loadingPromise, effectiveTtlMs);

		this.dataMap.set(key, newNode);
		this._addToHead(newNode);
		this._evictIfNeeded();

		loadingPromise.catch(err =>
		{
			console.error(`[AsyncLRUCache ERROR] Loader for key ${key} failed. Removing from cache.`, err);

			if (this.dataMap.get(key) === newNode)
			{
				this.dataMap.delete(key);
				this._removeNode(newNode);
			}
		});

		return loadingPromise;
	}

	/**
	 * Puts a value into the cache, and optionally executes a saver function to persist it.
	 * This method serializes multiple put operations for the same key, ensuring they execute in order.
	 * @param key - Cache key.
	 * @param value - Value to cache.
	 * @param saver - Optional asynchronous save function.
	 * @param ttlMs - Optional TTL override for this entry in milliseconds.
	 * @returns A Promise that resolves to the latest value after the saver operation completes.
	 */
	public put(key: K, value: V, saver?: (key: K, value: V) => Promise<void>, ttlMs?: number): Promise<V>
	{
		const lastPromise = this.dataMap.has(key) ? this.dataMap.get(key)!.value : Promise.resolve(undefined as V);

		const saverPromise = lastPromise.catch((err) =>
		{
			// Ignore previous operation errors, so the new operation can proceed.
			console.warn(`[AsyncLRUCache WARN] Previous operation for key ${key} failed. Chaining new PUT operation.`, err.message);
		})
		.then(() =>
		{
			// After the previous operation (success or failure) completes, execute this saver.
			if (saver)
				return saver(key, value);
		})
		.then(() =>
		{
			// After saver completes, the final value of this Promise chain is the new value.
			return value;
		});

		let node = this.dataMap.get(key);
		const effectiveTtlMs = ttlMs ?? this.defaultTtlMs;

		if (!node)
		{
			node = new Node(key, saverPromise, effectiveTtlMs);
			this.dataMap.set(key, node);
			this._addToHead(node);
			this._evictIfNeeded();
		}
		else
		{
			// Update existing node with new value and TTL
			node.value = saverPromise;
			if (effectiveTtlMs !== undefined && effectiveTtlMs > 0)
			{
				node.expiresAt = Date.now() + effectiveTtlMs;
			}
			else
			{
				node.expiresAt = null;
			}
			this._moveToHead(node);
		}

		saverPromise.catch(err =>
		{
			console.error(`[AsyncLRUCache ERROR] Saver operation for key ${key} failed. Removing from cache.`, err);

			if (this.dataMap.get(key)?.value === saverPromise)
			{
				this.dataMap.delete(key);
				this._removeNode(node!);
			}
		});

		return saverPromise;
	}

	/**
	 * Invalidates and removes the cache entry associated with the specified key.
	 * @param key - The key of the cache entry to invalidate.
	 */
	public invalidate(key: K): void
	{
		const node = this.dataMap.get(key);

		if (node)
		{
			this._removeNode(node);
			this.dataMap.delete(key);
		}
	}

	/**
	 * Clears the entire cache, removing all entries.
	 */
	public clear(): void
	{
		this.dataMap.clear();

		// Manually clear all node links to avoid any potential memory leaks.
		let node = this.head;

		while (node !== null)
		{
			// Save reference to the next node, as we are about to break the current node's next link.
			const next = node.next;

			// Break all internal and external links of the current node and clear data.
			node.prev = null;
			node.next = null;
			node.key = null as any;
			node.value = Promise.resolve(undefined as V);
			node.expiresAt = null;

			// Move to the next node.
			node = next;
		}

		this.head = null;
		this.tail = null;
	}

	/**
	 * Destroys the cache instance, clearing all data and stopping any background timers.
	 * Call this method when you no longer need the cache to prevent memory leaks.
	 */
	public destroy(): void
	{
		// Stop the cleanup timer if it exists
		if (this.cleanupTimer)
		{
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = undefined;
		}

		// Clear all cache data
		this.clear();
	}

	/**
	 * Manually triggers cleanup of expired entries.
	 * This is useful if you want to force cleanup without waiting for the automatic interval.
	 */
	public cleanupExpired(): void
	{
		this._cleanupExpired();
	}

	/**
	 * Gets the current number of entries in the cache.
	 * @returns The number of entries currently in the cache.
	 */
	public size(): number
	{
		return this.dataMap.size;
	}

	/**
	 * Checks if a key exists in the cache and is not expired.
	 * @param key - The key to check.
	 * @returns True if the key exists and is not expired, false otherwise.
	 */
	public has(key: K): boolean
	{
		const node = this.dataMap.get(key);
		if (!node)
		{
			return false;
		}

		if (this._checkAndRemoveExpired(key, node))
		{
			return false;
		}

		return true;
	}
}
