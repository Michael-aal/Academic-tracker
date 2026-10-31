"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {levelFromXp,levelInfo,publicProgress,ENGLISH_ACTIVITIES,ENGLISH_CATEGORIES,ENGLISH_LESSONS}=require("../src/routes/learning");
test("levels advance every 100 XP",()=>{assert.equal(levelFromXp(0),1);assert.equal(levelFromXp(99),1);assert.equal(levelFromXp(100),2);assert.equal(levelFromXp(999),10);});
test("level progress is bounded",()=>{assert.deepEqual(levelInfo(165),{totalXp:165,level:2,title:"Curious Learner",currentLevelXp:65,nextLevelXp:100,progressPercent:65,xpToNextLevel:35});});
test("badges unlock only at milestones",()=>{const p=publicProgress({totalXp:100,events:[]});assert.equal(p.badges.find(x=>x.id==="builder").unlocked,true);assert.equal(p.badges.find(x=>x.id==="master").unlocked,false);});
test("English curriculum covers vocabulary, spelling, grammar, parts of speech, figures, oral English and comprehension",()=>{const c=new Set(ENGLISH_ACTIVITIES.map(x=>x.category));for(const x of ["vocabulary","spelling","grammar","parts-of-speech","figures-of-speech","oral-english","comprehension"])assert.equal(c.has(x),true);assert.ok(ENGLISH_CATEGORIES.length>=7);assert.ok(ENGLISH_LESSONS.length>=8);});
test("English activity IDs and answer indexes are valid",()=>{const ids=new Set();for(const x of ENGLISH_ACTIVITIES){assert.equal(ids.has(x.id),false);ids.add(x.id);assert.ok(x.answerIndex>=0&&x.answerIndex<x.options.length);}});
