import assert from 'node:assert/strict';
import { detailedIndustries, getIndustryGroup, getIndustryIconSource, isIndustry, matchesIndustry } from '../app/industry-options.ts';

const industry = '花屋';
assert.equal(isIndustry(industry), true);
assert.equal(detailedIndustries.filter((item) => item === industry).length, 1);
assert.equal(getIndustryGroup(industry)?.name, '小売・EC');
assert.equal(matchesIndustry([industry], industry), true);
assert.equal(matchesIndustry([industry], '小売・EC'), true);
assert.equal(matchesIndustry([industry], 'all'), true);
assert.equal(matchesIndustry([industry], '建設・不動産'), false);
assert.equal(getIndustryIconSource(industry), '/icons/industries/retail-ec.png');
assert.equal(isIndustry('家具の組み立て'), true);
assert.equal(getIndustryGroup('家具の組み立て')?.name, '建設・不動産');
console.log('花屋: 選択・絞り込み・アイコン・家具の組み立ての回帰チェック OK');
