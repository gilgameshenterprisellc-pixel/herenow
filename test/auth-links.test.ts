import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paramsFrom, isAuthLink } from '../lib/authLinkParams.ts'

// Password reset was dead end to end (Jacob, Aug 2026): the link opened the app
// and its tokens were never read. These pin the parsing, because a link that
// parses wrong fails silently — the user just gets told their password didn't
// save, with nothing in the logs.

test('implicit flow: tokens live in the fragment', () => {
  const p = paramsFrom('herenow://reset-password#access_token=abc123&refresh_token=def456&type=recovery&expires_in=3600')
  assert.equal(p.access_token, 'abc123')
  assert.equal(p.refresh_token, 'def456')
  assert.equal(p.type, 'recovery')
})

test('pkce flow: the code lives in the query string', () => {
  const p = paramsFrom('herenow://reset-password?code=pkce-code-here')
  assert.equal(p.code, 'pkce-code-here')
  assert.equal(p.access_token, undefined)
})

test('query AND fragment are both read, in either order', () => {
  const both = paramsFrom('https://herenow.app/reset-password?code=xyz#access_token=abc&refresh_token=def')
  assert.equal(both.code, 'xyz')
  assert.equal(both.access_token, 'abc')

  // Some clients hand back the fragment ahead of the query.
  const reversed = paramsFrom('https://herenow.app/reset#access_token=abc&refresh_token=def?code=xyz')
  assert.equal(reversed.access_token, 'abc')
})

test('values are URL-decoded', () => {
  const p = paramsFrom('herenow://reset-password#error_description=Email+link+is+invalid%20or%20has%20expired')
  assert.ok(p.error_description?.includes('expired'), `got ${p.error_description}`)
})

test('an expired link is recognised as an error, not as nothing', () => {
  // This is what a reused or stale reset link actually returns. Treating it as
  // "no auth material" would drop the user on a password form that can't work.
  const url = 'herenow://reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
  const p = paramsFrom(url)
  assert.equal(p.error, 'access_denied')
  assert.equal(isAuthLink(url), true)
})

test('ordinary deep links are not mistaken for auth links', () => {
  assert.equal(isAuthLink('herenow://zone/abc-123'), false)
  assert.equal(isAuthLink('herenow://reset-password'), false)
  assert.equal(isAuthLink(null), false)
  assert.equal(isAuthLink(undefined), false)
  assert.equal(isAuthLink(''), false)
})

test('a real auth link is recognised in both flows', () => {
  assert.equal(isAuthLink('herenow://reset-password#access_token=a&refresh_token=b&type=recovery'), true)
  assert.equal(isAuthLink('herenow://reset-password?code=abc'), true)
})

test('malformed pairs are skipped rather than throwing', () => {
  // A stray % is a decodeURIComponent throw waiting to happen, and it must not
  // take the usable tokens down with it.
  const p = paramsFrom('herenow://reset-password#access_token=good&bad=%E0%A4%A&refresh_token=alsogood')
  assert.equal(p.access_token, 'good')
  assert.equal(p.refresh_token, 'alsogood')
})

test('a URL with no query or fragment yields nothing, safely', () => {
  assert.deepEqual(paramsFrom('herenow://reset-password'), {})
  assert.deepEqual(paramsFrom(''), {})
})

test('the https web-build redirect parses the same as the custom scheme', () => {
  // On web the redirect is ${origin}/reset-password, not herenow:// — the app
  // has to read both, since a link can be opened on either.
  const p = paramsFrom('https://herenow.app/reset-password#access_token=abc&refresh_token=def&type=recovery')
  assert.equal(p.access_token, 'abc')
  assert.equal(p.type, 'recovery')
})
