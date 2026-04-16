import { describe, it, expect } from 'vitest';
import { BoundedMap } from '../bounded-map';

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
