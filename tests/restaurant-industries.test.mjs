import assert from 'node:assert/strict';
import { restaurantIndustries, isIndustry, getIndustryGroup, matchesIndustry } from '../app/industry-options.ts';
for (const value of restaurantIndustries) {
  assert.equal(isIndustry(value), true);
  assert.equal(getIndustryGroup(value)?.name, '飲食・食品');
  assert.equal(matchesIndustry([value], '飲食・食品'), true);
  assert.equal(matchesIndustry([value], '飲食店'), true);
  assert.equal(matchesIndustry([value], value), true);
}
assert.equal(isIndustry('飲食店'), true);
assert.equal(isIndustry('カフェ・喫茶店'), true);
assert.equal(matchesIndustry(['中華料理'], 'イタリアン'), false);
assert.equal(matchesIndustry(['飲食店'], 'イタリアン'), false);
assert.equal(matchesIndustry(['花屋'], '飲食店'), false);
console.log('飲食店ジャンルと既存業種の回帰チェック OK');
