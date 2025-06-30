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
	 * Creates a new Node instance.
	 * @param key - The key associated with this node.
	 * @param value - A Promise that resolves to the value of this node.
	 */
	constructor(key: K, value: Promise<V>)
	{
		this.key = key;
		this.value = value;
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
}

/**
 * Asynchronous LRU Cache class.
 * - Supports asynchronous loaders for data fetching.
 * - Supports asynchronous savers for data persistence.
 * - Automatically merges concurrent requests (get) and serializes writes (put).
 * - Implements LRU eviction strategy.
 */
export class AsyncLRUCache<K, V>
{
	/**
	 * Maximum capacity of the cache.
	 */
	private readonly capacity: number;

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
	 * Creates an instance of AsyncLRUCache with the specified options.
	 * @param option - The configuration options for the cache.
	 * @throws {Error} Throws an error if the provided capacity is less than 10.
	 */
	constructor(option: AsyncLRUCacheOption)
	{
		if (option.capacity < 10)
			throw new Error("Capacity must be at least 10.");

		this.capacity = option.capacity;
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
	 * @returns A Promise that resolves to the required data.
	 */
	public get(key: K, loader: () => Promise<V>): Promise<V>
	{
		const node = this.dataMap.get(key);

		if (node)
		{
			this._moveToHead(node);

			return node.value;
		}

		const loadingPromise = loader();
		const newNode = new Node(key, loadingPromise);

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
	 * @returns A Promise that resolves to the latest value after the saver operation completes.
	 */
	public put(key: K, value: V, saver?: (key: K, value: V) => Promise<void>): Promise<V>
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

		if (!node)
		{
			node = new Node(key, saverPromise);
			this.dataMap.set(key, node);
			this._addToHead(node);
			this._evictIfNeeded();
		}
		else
		{
			node.value = saverPromise;
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

			// Move to the next node.
			node = next;
		}

		this.head = null;
		this.tail = null;
	}
}
