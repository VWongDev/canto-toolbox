import { describe, it, expect } from 'vitest';
import { BoundedMap } from '../bounded-map.js';

describe('BoundedMap.setAll', () => {
  it('keeps the top entries of the whole batch', () => {
    const map = new BoundedMap<string, number>(2, value => value);
    map.setAll([['a', 1], ['b', 5], ['c', 3]]);

    expect(map.size).toBe(2);
    expect(map.get('b')).toBe(5);
    expect(map.get('c')).toBe(3);
    expect(map.get('a')).toBeUndefined();
  });

  it('keeps a late arrival that outranks an earlier one', () => {
    // Pruning per insert would have dropped the low entry before the high one
    // it should have been compared against ever arrived.
    const map = new BoundedMap<string, number>(1, value => value);
    map.setAll([['low', 1], ['high', 9]]);

    expect(map.get('high')).toBe(9);
  });

  it('overwrites an existing key rather than adding beside it', () => {
    const map = new BoundedMap<string, number>(3, value => value);
    map.setAll([['a', 1]]);
    map.setAll([['a', 7]]);

    expect(map.size).toBe(1);
    expect(map.get('a')).toBe(7);
  });

  it('accepts an empty batch', () => {
    const map = new BoundedMap<string, number>(2, value => value, [['a', 1]]);
    map.setAll([]);

    expect(map.size).toBe(1);
  });
});

describe('BoundedMap', () => {
  it('stores and retrieves values', () => {
    const map = new BoundedMap<string, number>(10, (v) => v);
    map.set('a', 5);
    expect(map.get('a')).toBe(5);
  });

  it('reports correct size', () => {
    const map = new BoundedMap<string, number>(10, (v) => v);
    map.set('a', 1);
    map.set('b', 2);
    expect(map.size).toBe(2);
  });

  it('prunes to maxSize keeping highest-scored entries', () => {
    const map = new BoundedMap<string, number>(3, (v) => v);
    map.set('low', 1);
    map.set('mid', 5);
    map.set('high', 10);
    map.set('highest', 20);
    expect(map.size).toBe(3);
    expect(map.has('highest')).toBe(true);
    expect(map.has('high')).toBe(true);
    expect(map.has('mid')).toBe(true);
    expect(map.has('low')).toBe(false);
  });

  it('prunes on construction when initial data exceeds maxSize', () => {
    const map = new BoundedMap<string, number>(2, (v) => v, [
      ['a', 1],
      ['b', 5],
      ['c', 3],
    ]);
    expect(map.size).toBe(2);
    expect(map.has('b')).toBe(true);
    expect(map.has('c')).toBe(true);
    expect(map.has('a')).toBe(false);
  });

  it('updates an existing key without growing past maxSize', () => {
    const map = new BoundedMap<string, number>(2, (v) => v);
    map.set('a', 1);
    map.set('b', 2);
    map.set('a', 99);
    expect(map.size).toBe(2);
    expect(map.get('a')).toBe(99);
  });

  it('serialises to a plain object via toObject', () => {
    const map = new BoundedMap<string, number>(10, (v) => v);
    map.set('x', 7);
    map.set('y', 3);
    expect(map.toObject()).toEqual({ x: 7, y: 3 });
  });

  it('is iterable', () => {
    const map = new BoundedMap<string, number>(10, (v) => v);
    map.set('a', 1);
    map.set('b', 2);
    const entries = [...map];
    expect(entries).toHaveLength(2);
  });
});
