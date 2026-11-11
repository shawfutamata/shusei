import assert from 'node:assert/strict';
import { detailedIndustries, getIndustryGroup, getIndustryIconSource, industries, isIndustry, matchesIndustry } from '../app/industry-options.ts';

const industry = '家具の組み立て';
assert.equal(isIndustry(industry), true);
assert.equal(detailedIndustries.filter((item) => item === industry).length, 1);
assert.equal(industries.filter((item) => item === industry).length, 1);
assert.equal(getIndustryGroup(industry)?.name, '建設・不動産');
assert.equal(matchesIndustry([industry], industry), true);
assert.equal(matchesIndustry([industry], '建設・不動産'), true);
assert.equal(matchesIndustry([industry], 'all'), true);
assert.equal(matchesIndustry([industry], '小売・EC'), false);
assert.equal(getIndustryIconSource(industry), '/icons/industries/construction-realestate.png');
assert.equal(isIndustry('家具・インテリア'), true);
assert.equal(getIndustryGroup('家具・インテリア')?.name, '小売・EC');
console.log('家具の組み立て: 選択・検証・絞り込み・アイコン・既存業種の回帰チェック OK');
