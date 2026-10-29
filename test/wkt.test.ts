import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wktOuterRing } from '../lib/wkt.ts'

const RING = '-86.743558 36.1953509, -86.7435291 36.19541, -86.7431788 36.1953781, -86.743558 36.1953509'
const POINTS: [number, number][] = [
  [-86.743558, 36.1953509], [-86.7435291, 36.19541], [-86.7431788, 36.1953781], [-86.743558, 36.1953509],
]

test('a plain polygon reads its ring', () => {
  assert.deepEqual(wktOuterRing(`POLYGON((${RING}))`), POINTS)
})

test('PostGIS spacing and no spaces after commas both read', () => {
  assert.deepEqual(wktOuterRing(`POLYGON ((${RING.replace(/, /g, ',')}))`), POINTS)
})

test('a multipolygon reads its first polygon instead of nothing', () => {
  assert.deepEqual(wktOuterRing(`MULTIPOLYGON(((${RING})),((1 1,2 2,3 1,1 1)))`), POINTS)
})

test('a polygon with a hole reads the outer edge only', () => {
  assert.deepEqual(wktOuterRing(`POLYGON((${RING}),(1 1,2 2,3 1,1 1))`), POINTS)
})

test('no outline gives an empty ring', () => {
  assert.deepEqual(wktOuterRing(null), [])
  assert.deepEqual(wktOuterRing(''), [])
  assert.deepEqual(wktOuterRing('POINT(1 2)'), [])
})
