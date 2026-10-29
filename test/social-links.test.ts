import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeSocialInput, normalizeSocialForm, safeSocialUrl, readSocialLinks, socialInputsFrom,
} from '../lib/socialLinks.ts'

const url = (r: ReturnType<typeof normalizeSocialInput>) => (r.ok ? r.url : `ERROR: ${r.error}`)

test('handles become profile links', () => {
  assert.equal(url(normalizeSocialInput('instagram', '@lakesidelounge')), 'https://www.instagram.com/lakesidelounge')
  assert.equal(url(normalizeSocialInput('instagram', 'martha.mydear')), 'https://www.instagram.com/martha.mydear')
  assert.equal(url(normalizeSocialInput('tiktok', '@the5spot')), 'https://www.tiktok.com/@the5spot')
  assert.equal(url(normalizeSocialInput('x', 'lakeside_bar')), 'https://x.com/lakeside_bar')
  assert.equal(url(normalizeSocialInput('facebook', 'lakesidelounge')), 'https://www.facebook.com/lakesidelounge')
})

test('pasted links are kept, forced to https', () => {
  assert.equal(url(normalizeSocialInput('instagram', 'https://www.instagram.com/lakesidelounge/')), 'https://www.instagram.com/lakesidelounge/')
  assert.equal(url(normalizeSocialInput('instagram', 'instagram.com/lakesidelounge')), 'https://instagram.com/lakesidelounge')
  assert.equal(url(normalizeSocialInput('x', 'http://twitter.com/lakeside')), 'https://twitter.com/lakeside')
  assert.equal(url(normalizeSocialInput('facebook', 'https://m.facebook.com/profile.php?id=1000123')), 'https://m.facebook.com/profile.php?id=1000123')
  assert.equal(url(normalizeSocialInput('tiktok', 'https://vm.tiktok.com/ZMabc123/')), 'https://vm.tiktok.com/ZMabc123/')
})

test('a link to the wrong site is refused', () => {
  assert.match(url(normalizeSocialInput('instagram', 'https://www.tiktok.com/@lakeside')), /That link doesn't go to Instagram./)
  assert.match(url(normalizeSocialInput('x', 'https://evil.example/x.com/lakeside')), /^ERROR/)
  assert.match(url(normalizeSocialInput('facebook', 'https://facebook.com.evil.example/lakeside')), /^ERROR/)
})

test('a platform home page is not a profile', () => {
  assert.match(url(normalizeSocialInput('instagram', 'instagram.com')), /not the home page/)
  assert.match(url(normalizeSocialInput('x', 'https://x.com/')), /not the home page/)
})

test('junk and scripts are refused', () => {
  assert.match(url(normalizeSocialInput('instagram', 'lakeside lounge')), /^ERROR/)
  assert.match(url(normalizeSocialInput('website', 'javascript:alert(1)')), /^ERROR/)
  assert.match(url(normalizeSocialInput('website', 'lakeside')), /^ERROR/)
  assert.match(url(normalizeSocialInput('x', 'this_handle_is_too_long_for_x')), /^ERROR/)
})

test('websites get https when typed bare', () => {
  assert.equal(url(normalizeSocialInput('website', 'lakesidelounge.com')), 'https://lakesidelounge.com')
  assert.equal(url(normalizeSocialInput('website', 'http://lakesidelounge.com/menu')), 'http://lakesidelounge.com/menu')
})

test('blank means no link', () => {
  assert.equal(url(normalizeSocialInput('instagram', '   ')), null)
})

test('the form keeps good links and reports bad ones by field', () => {
  const { links, errors } = normalizeSocialForm({
    instagram: '@lakesidelounge', facebook: '', tiktok: 'https://instagram.com/oops', website: 'lakesidelounge.com',
  })
  assert.deepEqual(links, { instagram: 'https://www.instagram.com/lakesidelounge', website: 'https://lakesidelounge.com' })
  assert.deepEqual(Object.keys(errors), ['tiktok'])
})

test('stored links are re-checked before they are shown', () => {
  assert.equal(safeSocialUrl('instagram', 'https://www.instagram.com/x'), 'https://www.instagram.com/x')
  assert.equal(safeSocialUrl('instagram', 'http://www.instagram.com/x'), null)
  assert.equal(safeSocialUrl('instagram', 'https://instagram.com.evil.example/x'), null)
  assert.equal(safeSocialUrl('website', 'javascript:alert(1)'), null)
  assert.equal(safeSocialUrl('website', 42), null)
})

test('the profile shows links in a fixed order and skips bad ones', () => {
  const shown = readSocialLinks({
    website: 'https://lakesidelounge.com', tiktok: 'https://www.tiktok.com/@x', instagram: 'javascript:alert(1)', facebook: '',
  })
  assert.deepEqual(shown.map(s => s.platform), ['tiktok', 'website'])
  assert.deepEqual(readSocialLinks(null), [])
  assert.deepEqual(readSocialLinks(['https://x.com/a']), [])
})

test('stored links come back into the form as full URLs', () => {
  const inputs = socialInputsFrom({ instagram: 'https://www.instagram.com/x' })
  assert.equal(inputs.instagram, 'https://www.instagram.com/x')
  assert.equal(inputs.website, '')
})
